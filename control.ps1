[CmdletBinding()]
param(
    [ValidateSet('status', 'camera', 'live', 'wakewords', 'look', 'standby', 'screen', 'current-content', 'modes', 'mode', 'highlight', 'workbench','privacy','stop','emergency-stop','context','tasks','routines','routine','graph','graph-search','graph-source','intel-catalog','intel','guide','guide-clear','artcraft','artcraft-select','artcraft-open','artcraft-link','audio-outputs','audio-output')]
    [string]$Action = 'status',
    [ValidateLength(1,100)][string]$Target,
    [ValidateSet('photo','vector','design','deck','grid','word','cad','light','sound','effect','film','pdf')][string]$App,
    [ValidateRange(1,65535)][int]$Port,
    [string]$TokenFile,
    [string]$EndpointFile,
    [ValidateSet('on', 'off')]
    [string]$State,
    [ValidateLength(1,500)]
    [string]$Question,
    [ValidateSet('system','console','browser','context','graph','intel','artcraft')][string]$Tab='system',
    [switch]$Agent,
    [ValidateLength(1,80)][ValidatePattern('^[A-Za-z0-9_-]{1,80}$')][string]$RequestId,
    [ValidateLength(0,160)][ValidatePattern('^[^\x00-\x1f\x7f]*$')][string]$Reason,
    [ValidateSet('earthquakes','cameras','ukraine','news','weather','flights','ships','stats','feed','clipboard','window')][string]$Kind,
    [ValidatePattern('^[a-z][a-z0-9/-]{0,60}$')][string]$Feed,
    [ValidateLength(0,200)][string]$Query,
    [ValidateLength(0,200)][string]$Region,
    [ValidateRange(-90,90)][double]$Latitude,
    [ValidateRange(-180,180)][double]$Longitude,
    [ValidateRange(1,1000)][double]$RadiusKm=25,
    [ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$Date,
    [ValidateLength(1,1024)][string]$GuideJson,
    [ValidateLength(1,400)][string]$NodeId,
    [string]$CapturedAt,
    [ValidateLength(0,800)][string]$Url,
    [ValidatePattern('^[a-z][a-z0-9-]{0,39}$')]
    [string]$Mode,
    [ValidatePattern('^[a-z][a-z0-9-]{0,39}$')][string]$Routine,
    [double]$X,
    [double]$Y,
    [double]$Width,
    [double]$Height,
    [ValidateLength(0,60)]
    [string]$Label = 'Hier',
    [ValidateSet('physical','dip')]
    [string]$CoordinateSpace = 'physical'
)

$ErrorActionPreference = 'Stop'
$Action = $Action.ToLowerInvariant()
if ($Action -notin @('status','look','standby','screen','current-content','modes','mode','highlight','stop','emergency-stop','context','tasks','routines','routine','graph','graph-search','graph-source','intel-catalog','intel','guide','guide-clear','artcraft','artcraft-select','artcraft-open','artcraft-link','audio-outputs','audio-output') -and -not $PSBoundParameters.ContainsKey('State')) {
    throw 'Camera, live, and wakewords controls require -State on or off.'
}
if ($Action -in @('look','screen') -and [string]::IsNullOrWhiteSpace($Question)) { throw 'Look requires -Question with the current visual question.' }
if ($Action -eq 'current-content' -and ($Kind -notin @('clipboard','window') -or [string]::IsNullOrWhiteSpace($Question))) { throw 'Current content requires -Kind clipboard or window and -Question from the explicit user request.' }
if ($Action -eq 'workbench' -and $Agent -and $State -eq 'off' -and [string]::IsNullOrWhiteSpace($RequestId)) { throw 'Closing an agent workbench requires -RequestId from its presentation result.' }
if ($Action -eq 'mode' -and [string]::IsNullOrWhiteSpace($Mode)) { throw 'Mode requires -Mode with a configured mode id.' }
if ($Action -eq 'routine' -and [string]::IsNullOrWhiteSpace($Routine)) { throw 'Routine requires -Routine with a configured routine id.' }
if ($Action -eq 'privacy' -and $State -ne 'on') { throw 'Privacy can only be locked remotely. Unlock locally in Lilith.' }
if ($Action -eq 'highlight' -and (@('X','Y','Width','Height') | Where-Object {-not $PSBoundParameters.ContainsKey($_)})) { throw 'Highlight requires X, Y, Width and Height from a current UI snapshot.' }
if ($Action -eq 'highlight' -and [string]::IsNullOrWhiteSpace($CapturedAt)) { throw 'Highlight requires -CapturedAt from the original UI observation. Do not replace an old observation time with now.' }
if ($Action -eq 'graph-search' -and [string]::IsNullOrWhiteSpace($Query)) { throw 'Graph search requires -Query.' }
if ($Action -eq 'graph-source' -and [string]::IsNullOrWhiteSpace($NodeId)) { throw 'Graph source requires -NodeId from a current graph search.' }
if ($Action -eq 'intel' -and [string]::IsNullOrWhiteSpace($Kind)) { throw 'Intel requires -Kind.' }
if ($Action -eq 'intel' -and $Kind -in @('clipboard','window')) { throw 'Intel requires an intelligence feed kind.' }
if ($Action -eq 'guide' -and [string]::IsNullOrWhiteSpace($GuideJson)) { throw 'Guide requires -GuideJson with current window identity, physical rectangles and the actual observation time.' }

try {
    $configuration = Get-Content -LiteralPath (Join-Path $PSScriptRoot '.local/control-api.json') -Raw | ConvertFrom-Json
    $controlUri = [Uri]$configuration.url
    if (-not $controlUri.IsAbsoluteUri -or $controlUri.Scheme -ne 'http' -or
        $controlUri.Host -ne '127.0.0.1' -or $controlUri.AbsolutePath -ne '/' -or
        $controlUri.UserInfo -or $controlUri.Query -or $controlUri.Fragment -or $controlUri.Port -lt 1 -or
        $configuration.token -isnot [string] -or [string]::IsNullOrWhiteSpace($configuration.token)) {
        throw 'Invalid configuration'
    }
} catch {
    throw 'Local control configuration is unavailable or invalid. Start the voice app first.'
}

$request = @{
    Uri = $controlUri.AbsoluteUri.TrimEnd('/') + '/v1/' + $Action
    Headers = @{ Authorization = 'Bearer ' + $configuration.token }
    Method = 'Get'
    TimeoutSec = 20
    MaximumRedirection = 0
    ErrorAction = 'Stop'
}
if ($Action -eq 'audio-output') {
    if($Target -notin @('speakers','headphones') -and $Target -notmatch '^\{0\.0\.0\.00000000\}\.\{[a-fA-F0-9]{8}(-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}\}$'){throw 'Choose headphones, speakers, or an active render endpoint ID.'}
    $request.Method='Post';$request.ContentType='application/json; charset=utf-8';$request.Body=[System.Text.Encoding]::UTF8.GetBytes((@{target=$Target}|ConvertTo-Json -Compress))
} elseif ($Action -in @('artcraft-select','artcraft-open','artcraft-link')) {
    if(-not $App){throw 'Artcraft requires -App.'}
    $craftPayload=@{appId=$App}
    if($Action -eq 'artcraft-link'){if($PSBoundParameters.ContainsKey('Port')){$craftPayload.port=$Port};if($TokenFile){$craftPayload.tokenFile=$TokenFile};if($EndpointFile){$craftPayload.endpointFile=$EndpointFile}}
    $request.Method='Post';$request.ContentType='application/json; charset=utf-8';$request.Body=[System.Text.Encoding]::UTF8.GetBytes(($craftPayload|ConvertTo-Json -Compress))
} elseif ($Action -eq 'guide') {
    $request.Method='Post'; $request.ContentType='application/json; charset=utf-8'; $request.Body=[System.Text.Encoding]::UTF8.GetBytes($GuideJson)
} elseif ($Action -eq 'graph-search') {
    $request.Method='Post'; $request.ContentType='application/json; charset=utf-8'; $request.Body=[System.Text.Encoding]::UTF8.GetBytes((@{query=$Query}|ConvertTo-Json -Compress))
} elseif ($Action -eq 'graph-source') {
    $request.Method='Post'; $request.ContentType='application/json; charset=utf-8'; $request.Body=[System.Text.Encoding]::UTF8.GetBytes((@{id=$NodeId}|ConvertTo-Json -Compress))
} elseif ($Action -eq 'intel') {
    $request.Method='Post'; $request.TimeoutSec=45; $request.ContentType='application/json; charset=utf-8'
    $intelPayload=@{kind=$Kind}
    if($Feed){$intelPayload.feed=$Feed}
    if($Query){$intelPayload.query=$Query}; if($Region){$intelPayload.region=$Region}; if($Date){$intelPayload.date=$Date}
    if($PSBoundParameters.ContainsKey('Latitude') -or $PSBoundParameters.ContainsKey('Longitude')) { if(-not $PSBoundParameters.ContainsKey('Latitude') -or -not $PSBoundParameters.ContainsKey('Longitude')) { throw 'Provide both latitude and longitude.' }; $intelPayload.lat=$Latitude; $intelPayload.lon=$Longitude; $intelPayload.radiusKm=$RadiusKm }
    $request.Body=[System.Text.Encoding]::UTF8.GetBytes(($intelPayload | ConvertTo-Json -Compress))
} elseif ($Action -eq 'current-content') {
    $request.Method = 'Post'
    $request.ContentType = 'application/json; charset=utf-8'
    $request.Body = [System.Text.Encoding]::UTF8.GetBytes((@{ kind = $Kind; question = $Question } | ConvertTo-Json -Compress))
} elseif ($Action -in @('look','screen')) {
    $request.Method = 'Post'
    $request.TimeoutSec = 150
    $request.ContentType = 'application/json; charset=utf-8'
    $request.Body = [System.Text.Encoding]::UTF8.GetBytes((@{ question = $Question } | ConvertTo-Json -Compress))
} elseif ($Action -in @('mode','routine')) {
    $request.Method = 'Post'
    $request.ContentType = 'application/json; charset=utf-8'
    $configuredId = if ($Action -eq 'mode') { $Mode } else { $Routine }
    $request.Body = [System.Text.Encoding]::UTF8.GetBytes((@{ id = $configuredId } | ConvertTo-Json -Compress))
} elseif ($Action -eq 'highlight') {
    $request.Method = 'Post'
    $request.ContentType = 'application/json; charset=utf-8'
    $request.Body = [System.Text.Encoding]::UTF8.GetBytes((@{ x=$X; y=$Y; width=$Width; height=$Height; label=$Label; capturedAt=$CapturedAt; coordinateSpace=$CoordinateSpace } | ConvertTo-Json -Compress))
} elseif ($Action -eq 'workbench') {
    $request.Method='Post'
    $request.ContentType='application/json; charset=utf-8'
    $workbenchPayload=@{enabled=($State -eq 'on');tab=$Tab}
    if($Url){$workbenchPayload.url=$Url}
    if($PSBoundParameters.ContainsKey('Agent')){$workbenchPayload.agent=[bool]$Agent}
    if($PSBoundParameters.ContainsKey('RequestId')){$workbenchPayload.requestId=$RequestId}
    if($PSBoundParameters.ContainsKey('Reason')){$workbenchPayload.reason=$Reason}
    $request.Body=[System.Text.Encoding]::UTF8.GetBytes(($workbenchPayload | ConvertTo-Json -Compress))
} elseif ($Action -in @('standby','stop','emergency-stop','guide-clear')) {
    $request.Method = 'Post'
    $request.ContentType = 'application/json'
    $request.Body = '{}'
} elseif ($Action -notin @('status','modes','context','tasks','routines','graph','intel-catalog','artcraft','audio-outputs')) {
    $request.Method = 'Post'
    $request.ContentType = 'application/json'
    $request.Body = @{ enabled = ($State -eq 'on') } | ConvertTo-Json -Compress
}

try {
    Invoke-RestMethod @request | ConvertTo-Json -Depth 8
} catch {
    throw 'Local voice control request failed. Check that the voice app is running and its local control is available.'
}
