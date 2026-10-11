# Guided visual explanations

The guide is a transparent visual overlay. It never sends mouse or keyboard input, moves the physical cursor, activates a target window or reports a click. The cyan dotted arrow is a simulated pointer; the user clicks manually. The whole-window glow can also indicate a running tool explicitly associated with that window. A glow does not verify the tool's result.

`createGuideOverlay({electron,root,readWindow,onChange})` supplies `show`, `clear`, `snapshot` and `dispose`. `show` accepts:

```js
await guide.show({
  purpose:'guide', // or 'activity'
  pid:123,windowId:456,
  windowRect:{x:100,y:100,width:900,height:600},
  targetRect:{x:300,y:250,width:100,height:40}, // optional; guide only
  observedAt:'2026-10-10T12:00:00.000Z', // original UIA observation time
  label:'Einstellungen',text:'Hier das Menü öffnen.',
  snapshotId:'source-snapshot' // optional; retained only during validation
});
```

Coordinates are physical desktop pixels, including negative monitor origins. These example numbers must be replaced by a fresh UIA observation. The observation cannot be older than 15 seconds or more than one second in the future. Do not replace its timestamp with the time of the guide request. The target rectangle must lie wholly inside the observed window.

An activity request requires `taskId` and `toolCallId`. The parent validates that they belong to the currently running task/tool before calling `show`; the overlay does not infer an association from the foreground app or a tool name. It rejects target rectangles for activity glows.

The native reader uses the decimal `windowId` as a Windows HWND. It verifies the exact HWND/PID, current title/process, visibility, minimized state and physical `GetWindowRect`. A changed identity or geometry difference over two pixels rejects the guide. Password managers, sign-in/payment/banking/private browsing windows are excluded. Opaque non-HWND identifiers are unsupported and must not be guessed or converted from unrelated identifiers.

The helper has a three-second deadline, receives separate validated numeric arguments and does not execute caller-provided shell text. It temporarily enables per-monitor DPI awareness for its own read. It never traverses controls or document bodies. Metadata remains ephemeral.

Each monitor intersection receives its own click-through, non-focusable overlay. Electron converts current DIP display bounds to physical coordinates and each overlay piece back to DIP. A window crossing monitors keeps one perimeter; its pointer and instruction card appear on the target monitor. Monitor changes clear all pieces. The window is rechecked after renderer loading and every 400 ms after the preceding read completes. A moved, hidden, minimized, closed, sensitive or unavailable window clears the guide rather than moving its pointer from old coordinates.

The guide expires at the original observation's 15-second deadline. Activity also expires after at most 10 seconds. Renewal requires another explicit `show` with a freshly verified UIA position. Browser scrolling or DOM changes cannot be detected from a window rectangle: the executor must clear on scrolling/navigation/target invalidation and reobserve before showing the next target. A screenshot or prose vision description does not establish a precise element rectangle.

The parent calls `clear()` on privacy, interruption, emergency stop, session changes and guidance cancellation, and `dispose()` on app exit. Clearing increments a generation before asynchronous work completes, preventing a late window read or renderer load from reopening the overlay. Local privacy does not revoke permissions of the independent Cua daemon; the parent must enforce its own access gate before requesting a guide.

`snapshot()` and `onChange` expose only visibility, purpose, redacted label/text, click-through status, simulated-pointer status and original observation/expiry times. They omit PID, HWND, snapshot tokens and task/tool identifiers. Renderer text uses `textContent`; the preload can receive display messages only. Reduced-motion settings disable the reticle pulse.

Focused validation: `node --test tests/guide-overlay.test.cjs`. Electron and native-window doubles test the boundary and cancellation behavior; a real Electron smoke check remains necessary for visual alignment, mixed-DPI monitors and click-through behavior.
