(function(root) {
  'use strict';
  const FRAME_MS=50,HOLD_MS=550,COOLDOWN_MS=1000;
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  function bend(a, b, c) {
    const ab = distance(a, b), bc = distance(b, c);
    if (ab < 0.00001 || bc < 0.00001) return 0;
    return ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y) + (a.z - b.z) * (c.z - b.z)) / (ab * bc);
  }
  const validPoints = points => Array.isArray(points) && points.length === 21 && points.every(p => p && ['x', 'y', 'z'].every(key => Number.isFinite(p[key])));
  function readHand(result) {
    if (result?.landmarks?.length !== 1 || !validPoints(result.landmarks[0])) return null;
    // HandLandmarker filters detection/presence itself; handedness is the result's available score.
    const confidence = result.handedness?.[0]?.[0]?.score;
    if (!Number.isFinite(confidence) || confidence < 0.7) return null;
    const image = result.landmarks[0], points = validPoints(result.worldLandmarks?.[0]) ? result.worldLandmarks[0] : image;
    if (distance(points[0], points[9]) < 0.00001) return null;
    const fingers = [5, 9, 13, 17].map(base => {
      const straight = bend(points[base], points[base + 1], points[base + 2]) < -0.72 &&
        bend(points[base + 1], points[base + 2], points[base + 3]) < -0.65 &&
        distance(points[base + 3], points[0]) > distance(points[base + 1], points[0]) * 1.15;
      const folded = bend(points[base], points[base + 1], points[base + 2]) > -0.35 &&
        distance(points[base + 3], points[0]) < distance(points[base + 1], points[0]) * 1.05;
      return { straight, folded };
    });
    // Existing palm/fist navigation still uses four-finger geometry independent of the thumb.
    const pose = fingers.every(finger => finger.straight) ? 'palm' : fingers.every(finger => finger.folded) ? 'fist' : null;
    const palm = [0, 5, 9, 13, 17];
    return { pose, x: palm.reduce((sum, i) => sum + image[i].x, 0) / palm.length,
      y: palm.reduce((sum, i) => sum + image[i].y, 0) / palm.length,confidence,fingers,
      tip:image[8],pinchPoint:{x:(image[4].x+image[8].x)/2,y:(image[4].y+image[8].y)/2},pinch:distance(points[4],points[8])/Math.max(distance(points[5],points[17]),.00001),
      indexAway:distance(points[8],points[0])>distance(points[5],points[0])*1.1 };
  }

  class GestureController {
    constructor({ loadDetector, onAction = () => {}, onSpatial = () => {}, onState = () => {}, now = () => performance.now(), mirror=true,desktop=false,spatialBounds = {left:.1,right:.9,top:.1,bottom:.9} }) {
      this.loadDetector = loadDetector;
      this.onAction = onAction;
      this.onSpatial = onSpatial;
      this.desktop=desktop===true;
      if(typeof mirror!=='boolean')throw TypeError('Ungültige Gestenrichtung');this.mirror=mirror;
      if(!spatialBounds||!['left','right','top','bottom'].every(key=>Number.isFinite(spatialBounds[key])&&spatialBounds[key]>=0&&spatialBounds[key]<=1)||spatialBounds.right-spatialBounds.left<.1||spatialBounds.bottom-spatialBounds.top<.1)throw new TypeError('Ungültiger Gestenbereich');
      this.spatialBounds = {...spatialBounds};
      this.onState = onState;
      this.now = now;
      this.detector = null;
      this.video = null;
      this.stream = null;
      this.timer = null;
      this.pending = null;
      this.inFlight = false;
      this.generation = 0;
      this.trackListeners = [];
      this.lastAction = -Infinity;
      this.spatialSequence = 0;
      this.spatialCandidate = null;
      this.spatialActive = false;
      this.pinching = false;
      this.pinchSince = null;
      this.resetPose();
    }
    get active() { return Boolean(this.detector); }
    setDesktop(enabled){if(this.desktop===enabled)return;this.cancelSpatial();this.resetPose();this.desktop=enabled===true;this.state(this.desktop?'Desktopsteuerung · zeigen, greifen oder zwei Finger':'Gesten aktiv · Werkstattsteuerung');}
    cameraLive(video) {
      return Boolean(video?.srcObject && video.srcObject.getVideoTracks?.().some(track => track.readyState === 'live' && track.enabled !== false));
    }
    state(status, extra = {}) {const value={active:this.active,loading:Boolean(this.pending&&!this.active),status,...extra},signature=JSON.stringify(value);if(signature===this.lastState)return;this.lastState=signature;this.onState(value);}
    resetPose() { this.candidate = null; this.swipe = []; this.lastProcess = null; }
    navigation(hand,phase,progress=0){return {x:Math.round(Math.max(0,Math.min(1,hand.x))*100)/100,phase,progress:Math.max(0,Math.min(1,progress))};}
    emitSpatial(value) { this.onSpatial({...value,generation:this.generation,sequence:++this.spatialSequence,at:Date.now()}); }
    cancelSpatial() {
      const wasActive=this.spatialActive;this.spatialActive=false;this.spatialCandidate=null;this.pinching=false;this.pinchSince=null;this.pointerFilter=null;this.twoHand=null;
      if(wasActive)this.emitSpatial({kind:'cancel'});
    }
    processSpatial(hand,time) {
      const folded=hand.fingers.slice(1).every(finger=>finger.folded);
      const pinchPose=hand.indexAway&&hand.pinch<=(this.pinching?.4:.24);
      const pointing=folded&&hand.fingers[0].straight;
      const scrolling=this.desktop&&!pinchPose&&hand.fingers[0].straight&&hand.fingers[1].straight&&hand.fingers.slice(2).every(finger=>finger.folded);
      const releasing=this.desktop&&this.pinching&&!pinchPose&&hand.indexAway;
      if(hand.confidence<(this.spatialActive?.8:.85)||(!pinchPose&&!pointing&&!scrolling&&!releasing)){this.cancelSpatial();return false;}
      if(pinchPose){this.pinchSince??=time;}else this.pinchSince=null;
      const pinch=pinchPose&&(this.pinching||time-this.pinchSince>=100);
      this.candidate=null;this.swipe=[];
      if(!this.spatialCandidate){this.spatialCandidate={since:time};this.state('Zeigefinger erkannt · kurz ruhig halten',{pose:'point'});}
      if(time-this.spatialCandidate.since<150)return true;
      const bounds=this.spatialBounds,clamp=value=>Math.max(0,Math.min(1,value));
      const point=pinch?hand.pinchPoint:hand.tip;
      const value={kind:'pointer',x:clamp((point.x-bounds.left)/(bounds.right-bounds.left)),y:clamp((point.y-bounds.top)/(bounds.bottom-bounds.top)),pinching:pinch,...(this.desktop?{scrolling}:{})};
      const previous=this.pointerFilter;
      if(previous&&pinch===this.pinching){const jump=Math.hypot(value.x-previous.x,value.y-previous.y),dt=time-previous.time,alpha=jump>.25?1:1-Math.exp(-dt/(jump>.06?25:80));value.x=previous.x+alpha*(value.x-previous.x);value.y=previous.y+alpha*(value.y-previous.y);}
      this.pointerFilter={x:value.x,y:value.y,time};
      this.pinching=pinch;this.spatialActive=true;const generation=this.generation;this.emitSpatial(value);
      if(generation===this.generation)this.state(this.desktop?(scrolling?'Zwei Finger · scrollen':pinch?'Pinch · loslassen zum Klicken, bewegen zum Ziehen':'Zeigen · Desktopzeiger bewegen'):(pinch?'Pinch · Projekt-Orb drehen und zoomen':'Zeigen · Projektknoten hervorheben'),{pose:pinch?'pinch':'point'});
      return true;
    }
    async enable(video) {
      if (this.video === video && this.stream === video?.srcObject && this.cameraLive(video)) {
        if (this.active) return true;
        if (this.pending) return this.pending;
      }
      this.disable();
      if (!this.cameraLive(video)) { this.state('Gesten aus · zuerst Kamera einschalten'); return false; }
      const generation = this.generation;
      this.video = video;
      this.stream = video.srcObject;
      this.lastInference = -Infinity;
      this.lastTimestamp = -Infinity;
      this.lastVideoTime = null;
      this.lastAction = -Infinity;
      for (const track of this.stream.getVideoTracks()) {
        const listener = () => this.disable('Gesten aus · Kamera nicht verfügbar');
        track.addEventListener?.('ended', listener);
        this.trackListeners.push({ track, listener });
      }
      this.state('Gestenmodell wird lokal geladen …', { loading: true });
      this.pending = (async () => {
        let detector;
        try {
          detector = await this.loadDetector();
          if (generation !== this.generation) { detector?.close?.(); return false; }
          if (!this.cameraLive(video) || video.srcObject !== this.stream) {
            detector?.close?.(); this.disable('Gesten aus · Kamera nicht verfügbar'); return false;
          }
          if (typeof detector?.detectForVideo !== 'function' || typeof detector?.close !== 'function') throw new Error('Ungültiges Gestenmodell');
          this.detector = detector;
          this.timer = setInterval(() => this.tick(), FRAME_MS/2);
          this.state('Gesten aktiv'+(detector.delegate?' · '+detector.delegate:'')+' · offene Hand oder Faust zeigen', { loading: false });
          return true;
        } catch (error) {
          if (generation !== this.generation) return false;
          if (detector !== this.detector) { try { detector?.close?.(); } catch (_) {} }
          this.disable();
          this.state('Gesten nicht verfügbar · lokales Modell prüfen', { loading: false, error: error.message || String(error) });
          return false;
        } finally {
          if (generation === this.generation) this.pending = null;
        }
      })();
      return this.pending;
    }
    disable(status = 'Gesten aus') {
      this.cancelSpatial();
      this.generation++;
      clearInterval(this.timer);
      this.timer = null;
      for (const { track, listener } of this.trackListeners) track.removeEventListener?.('ended', listener);
      this.trackListeners = [];
      const detector = this.detector;
      this.detector = null;
      this.pending = null;
      this.inFlight = false;
      this.video = null;
      this.stream = null;
      this.resetPose();
      try { detector?.close(); } catch (_) {}
      this.state(status, { loading: false });
    }
    async tick(video = this.video) {
      if (!this.active) return;
      if (video !== this.video || !this.cameraLive(video) || video.srcObject !== this.stream) {
        this.disable('Gesten aus · Kamera nicht verfügbar'); return;
      }
      const time = this.now();
      if(this.inFlight){if(Number.isFinite(time)&&time-this.lastInference>350)this.cancelSpatial();return;}
      if(this.spatialActive&&Number.isFinite(time)&&time-this.lastInference>350&&video.currentTime===this.lastVideoTime){this.cancelSpatial();this.resetPose();}
      if (!Number.isFinite(time) || time - this.lastInference < FRAME_MS-2 || video.readyState < 2 ||
          !(video.videoWidth > 0 && video.videoHeight > 0) || !Number.isFinite(video.currentTime) || video.currentTime === this.lastVideoTime) return;
      this.lastInference = time;
      this.lastVideoTime = video.currentTime;
      const timestamp = Math.max(time, this.lastTimestamp + 1);
      this.lastTimestamp = timestamp;
      const generation = this.generation;
      this.inFlight = true;
      try {
        const result = await this.detector.detectForVideo(video, timestamp);
        if (generation !== this.generation || !this.active) return;
        if (!this.cameraLive(video) || video.srcObject !== this.stream) {
          this.disable('Gesten aus · Kamera nicht verfügbar'); return;
        }
        const completedAt=this.now();
        if(!Number.isFinite(completedAt)||completedAt<time||completedAt-time>350){this.cancelSpatial();this.resetPose();return;}
        this.process(result, time);
      }
      catch (error) {
        if (generation !== this.generation) return;
        this.disable();
        this.state('Gesten nicht verfügbar · Erkennung angehalten', { loading: false, error: error.message || String(error) });
      } finally {
        if (generation === this.generation) this.inFlight = false;
      }
    }
    process(result, time = this.now()) {
      if (!this.active || !Number.isFinite(time)) return;
      if(this.desktop&&result?.landmarks?.length===2){
        const hands=result.landmarks.map((points,index)=>readHand({landmarks:[points],worldLandmarks:result.worldLandmarks?.[index]?[result.worldLandmarks[index]]:[],handedness:[result.handedness?.[index]]}));
        const labels=new Set(result.handedness?.map(items=>items?.[0]?.categoryName));
        const valid=hands.every(hand=>hand&&hand.confidence>=.85&&hand.indexAway&&hand.pinch<=.24)&&labels.has('Left')&&labels.has('Right');
        if(!valid||this.lastProcess!==null&&(time<=this.lastProcess||time-this.lastProcess>350)){this.cancelSpatial();this.resetPose();this.state('Zwei Hände · beide mit Daumen und Zeigefinger greifen');return;}
        if(!this.twoHand){this.cancelSpatial();this.resetPose();this.twoHand={since:time,span:Math.hypot(hands[0].pinchPoint.x-hands[1].pinchPoint.x,hands[0].pinchPoint.y-hands[1].pinchPoint.y)};}
        this.lastProcess=time;const pair=this.twoHand,span=Math.hypot(hands[0].pinchPoint.x-hands[1].pinchPoint.x,hands[0].pinchPoint.y-hands[1].pinchPoint.y);
        if(span<.12){this.cancelSpatial();this.resetPose();return;}
        if(time-pair.since>=200){this.spatialActive=true;this.emitSpatial({kind:'zoom',delta:Math.max(-1,Math.min(1,Math.log(span/pair.span)))});pair.span=span;this.state('Zwei Hände · auseinander: größer, zusammen: kleiner');}return;
      }
      if(this.twoHand){this.cancelSpatial();this.resetPose();}
      let hand = readHand(result);
      if (!hand) {
        const hadPose = Boolean(this.candidate)||this.spatialActive;
        this.cancelSpatial();this.resetPose();
        if (result?.landmarks?.length>1)this.state('Zwei Hände erkannt · bitte nur eine Hand zeigen',{navigation:null});
        else if (hadPose)this.state('Gesten aktiv · keine sichere Hand',{navigation:null});
        return;
      }
      if(this.mirror)hand={...hand,x:1-hand.x,tip:{...hand.tip,x:1-hand.tip.x},pinchPoint:{...hand.pinchPoint,x:1-hand.pinchPoint.x}};
      if (this.lastProcess !== null && time <= this.lastProcess) {this.cancelSpatial();this.resetPose();return;}
      if (this.lastProcess !== null && time - this.lastProcess > 350) {this.cancelSpatial();this.resetPose();}
      this.lastProcess = time;
      if(this.processSpatial(hand,time))return;
      if(this.desktop){this.resetPose();this.state('Desktopsteuerung · zeigen, greifen oder zwei Finger',{navigation:null});return;}
      if(!hand.pose){this.resetPose();return;}
      if (!this.candidate || this.candidate.pose !== hand.pose) {
        this.candidate = { pose: hand.pose, since: time, anchor: hand, consumed: false };
        this.swipe = [];
        this.state(hand.pose === 'palm' ? 'Offene Hand erkannt · ruhig halten oder wischen' : 'Faust erkannt · ruhig halten', { pose: hand.pose });
      }
      let candidate = this.candidate;
      candidate.handX=hand.x;
      if (candidate.consumed) {
        if(hand.pose!=='palm')return;
        if(hand.x<.35||hand.x>.65){candidate.rearm=null;this.state('Hand zur Mitte zurückführen',{pose:'palm',navigation:this.navigation(hand,'return')});return;}
        if(!candidate.rearm||Math.hypot(hand.x-candidate.rearm.x,hand.y-candidate.rearm.y)>.025)candidate.rearm={x:hand.x,y:hand.y,since:time};
        if(time-this.lastAction<COOLDOWN_MS){this.state('Kurz warten · Hand in der Mitte halten',{pose:'palm',navigation:this.navigation(hand,'cooldown',(time-this.lastAction)/COOLDOWN_MS)});return;}
        const progress=(time-candidate.rearm.since)/150;
        if(progress<1){this.state('Hand in der Mitte kurz ruhig halten',{pose:'palm',navigation:this.navigation(hand,'center',progress)});return;}
        candidate=this.candidate={pose:'palm',since:time,anchor:hand,handX:hand.x,consumed:false,navigationOnly:true};this.swipe=[];
        this.state('Bereit für den nächsten Wisch',{pose:'palm',navigation:this.navigation(hand,'ready')});
      }
      if (hand.pose === 'palm') {
        this.swipe.push({ x: hand.x, y: hand.y, time });
        this.swipe = this.swipe.filter(point => time - point.time <= 850);
        const first = this.swipe[0], dx = hand.x - first.x, dy = hand.y - first.y;
        const direction = Math.sign(dx);
        const steady = this.swipe.every((point, index) => !index || direction * (point.x - this.swipe[index - 1].x) >= -0.025);
        const verticalRange = Math.max(...this.swipe.map(point => point.y)) - Math.min(...this.swipe.map(point => point.y));
        if (this.swipe.length >= 3 && time - first.time >= 200 && Math.abs(dx) >= 0.22 && verticalRange <= 0.1 &&
            Math.abs(dx) >= Math.abs(dy) * 1.7 && steady) {
          this.fire(dx < 0 ? 'workbench-next' : 'workbench-previous', time); return;
        }
        if(Math.abs(dx)>.035){this.state('Weiter seitlich wischen',{pose:'palm',navigation:this.navigation(hand,'moving',Math.abs(dx)/.22)});}
        else if(candidate.navigationOnly)this.state('Bereit · Handpunkt seitlich bewegen',{pose:'palm',navigation:this.navigation(hand,'ready')});
      }
      if (Math.hypot(hand.x - candidate.anchor.x, hand.y - candidate.anchor.y) > 0.08) {
        candidate.since = time; candidate.anchor = hand;
      }
      if(candidate.navigationOnly)return;
      const progress=Math.min(1,Math.floor((time-candidate.since)/HOLD_MS*10)/10);
      if(hand.pose!=='palm'||this.swipe.length<2||Math.abs(hand.x-this.swipe[0].x)<=.035)this.state((hand.pose==='palm'?'Offene Hand · Werkstatt öffnen':'Faust · Werkstatt schließen')+' · '+Math.round(progress*100)+' %',{pose:hand.pose,progress,navigation:hand.pose==='palm'?this.navigation(hand,'tracking'):null});
      if (time - candidate.since >= HOLD_MS) this.fire(hand.pose === 'palm' ? 'workbench-show' : 'workbench-hide', time);
    }
    fire(action, time) {
      this.candidate.consumed = true;
      this.swipe = [];
      if (time - this.lastAction < COOLDOWN_MS) {this.state('Kurze Gestenpause · Hand lösen und neu beginnen',{pose:this.candidate.pose});return;}
      this.lastAction = time;
      const generation = this.generation, pose = this.candidate.pose;
      this.onAction(action);
      if (generation !== this.generation) return;
      const status = { 'workbench-show': 'Workbench eingeblendet', 'workbench-hide': 'Workbench ausgeblendet',
        'workbench-next': 'Nächster Workbench-Bereich', 'workbench-previous': 'Vorheriger Workbench-Bereich' }[action];
      this.state(status, { pose, action,navigation:pose==='palm'?{x:Math.max(0,Math.min(1,this.candidate.handX)),phase:'return',progress:0}:null });
    }
  }
  if (typeof module === 'object' && module.exports) module.exports = { GestureController };
  else root.GestureController = GestureController;
})(typeof window === 'object' ? window : globalThis);
