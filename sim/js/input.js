// One Xbox-style controller, also mapped to the keyboard.
// The layout follows the team's single-controller ("debug controller") layout
// in RobotContainer.java: left stick translate, right stick rotate,
// LT intake, RT shoot, LB reverse pipeline, RB intake eject, X = X-brake,
// B = reset heading, Start = toggle auto-aim, Back = reset.

export const KEYMAP = [
  ['W A S D', 'Left stick', 'Drive (field-relative)'],
  ['← →  or  Q E', 'Right stick', 'Rotate'],
  ['Space', 'RT', 'Shoot (hold)'],
  ['Shift', 'LT', 'Intake: deploy and run (hold)'],
  ['Y', 'Y', 'Stow intake'],
  ['G', 'RB', 'Eject fuel out of the intake (hold)'],
  ['R', 'LB', 'Reverse feeder and indexer (hold)'],
  ['X', 'X', 'X-brake (hold)'],
  ['F', 'A', 'Trench align (hold)'],
  ['B', 'B', 'Reset field-relative heading'],
  ['T', 'Start', 'Toggle auto-aim'],
  ['Backspace', 'Back', 'Reset mechanisms'],
  ['I J K L', 'D-pad', 'Nudge 0.25 m/s (robot-relative)'],
  ['C  or  1–4', '', 'Change camera'],
  ['Enter', '', 'Restart match'],
  ['P', '', 'Pause'],
  ['H', '', 'Show / hide this help'],
];

const BUTTONS = ['a', 'b', 'x', 'y', 'lb', 'rb', 'start', 'back'];

export class Input {
  constructor() {
    this.keys = new Set();
    this.state = { lx: 0, ly: 0, rx: 0, lt: 0, rt: 0, povX: 0, povY: 0, pressed: {} };
    BUTTONS.forEach(b => (this.state[b] = false));
    this.prev = {};
    this.uiPressed = new Set();
    this.gamepadName = null;
    this.anyInput = false;
    window.addEventListener('keydown', e => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.uiPressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** Keys pressed since the last call (for UI actions such as camera and pause). */
  takeUi() { const s = this.uiPressed; this.uiPressed = new Set(); return s; }

  poll() {
    const k = c => this.keys.has(c) ? 1 : 0;
    const s = this.state;
    // field-relative: "forward" is away from the driver station
    let ly = k('KeyW') - k('KeyS'), lx = k('KeyA') - k('KeyD');
    let rx = (k('ArrowLeft') || k('KeyQ')) - (k('ArrowRight') || k('KeyE'));
    let lt = k('ShiftLeft') || k('ShiftRight'), rt = k('Space');
    let povX = k('KeyJ') - k('KeyL'), povY = k('KeyI') - k('KeyK');
    const btn = { a: k('KeyF'), b: k('KeyB'), x: k('KeyX'), y: k('KeyY'), lb: k('KeyR'), rb: k('KeyG'),
      start: k('KeyT'), back: k('Backspace') };
    const keyRot = rx !== 0;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = Array.from(pads).find(p => p && p.connected && p.mapping === 'standard') || Array.from(pads).find(p => p && p.connected);
    this.gamepadName = gp ? gp.id : null;
    if (gp) {
      const ax = i => gp.axes[i] || 0, b = i => (gp.buttons[i] ? gp.buttons[i].value : 0);
      // WPILib convention used by DriveCommand: forward = -leftY, left = -leftX, ccw = -rightX
      if (Math.hypot(ax(0), ax(1)) > 0.05 && !lx && !ly) { lx = -ax(0); ly = -ax(1); }
      if (Math.abs(ax(2)) > 0.05 && !rx) rx = -ax(2);
      lt = Math.max(lt, b(6)); rt = Math.max(rt, b(7));
      btn.a = btn.a || b(0); btn.b = btn.b || b(1); btn.x = btn.x || b(2); btn.y = btn.y || b(3);
      btn.lb = btn.lb || b(4); btn.rb = btn.rb || b(5); btn.back = btn.back || b(8); btn.start = btn.start || b(9);
      if (!povX) povX = b(14) - b(15);
      if (!povY) povY = b(12) - b(13);
    }
    // Keyboard keys are all-or-nothing; full-rate rotation (11 rad/s) is too
    // twitchy on a key, so keyboard rotation is 40% (the stick gives the full range).
    s.lx = lx; s.ly = ly; s.rx = keyRot ? rx * 0.4 : rx; s.lt = lt; s.rt = rt; s.povX = povX; s.povY = povY;
    s.pressed = {};
    for (const n of BUTTONS) {
      const v = btn[n] > 0.5;
      s.pressed[n] = v && !this.prev[n];
      this.prev[n] = v; s[n] = v;
    }
    this.anyInput = !!(lx || ly || rx || lt > 0.3 || rt > 0.3 || BUTTONS.some(n => s[n]));
    return s;
  }
}
