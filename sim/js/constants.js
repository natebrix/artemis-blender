// Constants for the ARTEMIS simulator.
// "code:" values are copied from the robot code (natebrix/2026-Rebuilt, unstable
// branch: Constants.java, FuelSim.java, AutoAimController.java).
// "est:" values are estimates, because the code does not state them in plain units.

export const IN = 0.0254;

// ---- field (code: FuelSim.java) ----
export const FIELD_LENGTH = 16.51;
export const FIELD_WIDTH = 8.04;
export const FUEL_RADIUS = 0.075;
export const FUEL_MASS = 0.448 * 0.45392;
export const TRENCH_WIDTH = 1.265;
export const TRENCH_BLOCK_WIDTH = 0.305;
export const TRENCH_HEIGHT = 0.565;
export const TRENCH_BAR_HEIGHT = 0.102;
export const TRENCH_BAR_WIDTH = 0.152;
export const BUMP_HEIGHT = 0.165;
export const BUMP_X = [3.96, 4.61, 5.18];          // start, peak, end (blue side)
export const BUMP_Y_OUTER = 1.57;                   // bumps run from here ...
export const BUMP_Y_INNER = 0.60;                   // ... to this far from the centre line
export const HUB = { side: 1.2, entryHeight: 1.83, entryRadius: 0.56,
  netMin: 1.5, netMax: 3.057, netOffset: 0.6 + 0.261, netWidth: 1.484 };
export const BLUE_HUB = { x: 4.61, y: FIELD_WIDTH / 2, exit: [5.3, FIELD_WIDTH / 2, 0.89], dir: 1 };
export const RED_HUB = { x: FIELD_LENGTH - 4.61, y: FIELD_WIDTH / 2,
  exit: [FIELD_LENGTH - 5.3, FIELD_WIDTH / 2, 0.89], dir: -1 };

// ---- fuel physics (code: FuelSim.java) ----
export const GRAVITY = 9.81;
export const FIELD_COR = Math.sqrt(22 / 51.5);
export const FUEL_COR = 0.5;
export const NET_COR = 0.2;
export const ROBOT_COR = 0.1;
export const FRICTION = 0.1;
export const DRAG_K = 0.5 * 1.2041 * 0.47 * Math.PI * FUEL_RADIUS * FUEL_RADIUS / FUEL_MASS; // accel = -k |v| v
export const PHYSICS_DT = 0.004;                    // code: 0.02 s period / 5 subticks

// ---- robot (code: Constants.java) ----
export const ROBOT_LENGTH = 0.8185;                 // with bumpers, along robot x
export const ROBOT_WIDTH = 0.87565;                 // with bumpers, along robot y
export const BUMPER_HEIGHT = 0.20;
export const MAX_VELOCITY = 4.39;                   // m/s
export const MAX_ANGULAR_VELOCITY = 11.015797;      // rad/s
export const STICK_DEADBAND = 0.06;
export const TRANSLATION_SLEW = 600 * IN;           // m/s^2
export const ROTATION_SLEW = 16 * 3 * Math.PI;      // rad/s^2
export const NUDGE_SPEED = 0.25;                    // m/s (D-pad)
export const TILT_THRESHOLD_DEG = 1.0;
export const TILT_DEBOUNCE = 0.05;
export const MODULES = [[0.264, 0.289], [0.264, -0.289], [-0.264, 0.289], [-0.264, -0.289]]; // FL FR BL BR
export const MODULE_NAMES = ['FL', 'FR', 'BL', 'BR'];
export const WHEEL_RADIUS = 0.0508;
export const TRENCH_ALIGN_Y = 3.4;                  // lanes at hub.y -/+ 3.4 m
export const TRENCH_ALIGN_MAX_V = 3.0;
export const TRENCH_LOOKAHEAD_SEC = 0.5;

// mechanisms (code)
export const TURRET_PIVOT = [-0.118295, -0.143695]; // robot frame
export const TURRET_LIMITS = [-170, 225];           // deg
export const TURRET_FORWARD_DEG = 90;               // turret 0 shoots toward robot +y
export const HOOD_LIMITS = [0, 40];                 // deg; launch pitch = 90 - hood
export const PITCH_LIMITS = [50, 90];
export const INTAKE_STOW_DEG = 130;
export const INTAKE_READY_DEG = 0;
export const MAX_SHOOTER_RPS = 110;
export const PERCENT_LOSS = 0.10720;
export const SHOOTER_M_PER_REV = Math.PI * 1.92 * IN;   // surface speed per flywheel rev
export const SHOT_INTERVAL = 0.094915;              // s between shots
export const INITIAL_FUEL = 8;
export const TURRET_TOLERANCE_DEG = 7.5;
export const HOOD_TOLERANCE_DEG = 4.0;
export const HUB_POSE = [4.625, 4.035];
export const HUB_SHOT_PADDING = 0.1;
export const PASS_OFFSET = 2.135;                   // pass targets at (1, hub.y +/- this)
export const PASS_SPEED_SCALE = 1.05;

// est: not given in plain units in the code
export const HOPPER_CAPACITY = 40;                  // the code's sim uses 500; this is a guess
export const TURRET_MAX_VEL = 540;                  // deg/s
export const TURRET_MAX_ACC = 2500;                 // deg/s^2
export const HOOD_MAX_VEL = 180;                    // deg/s
export const PIVOT_MAX_VEL = 320;                   // deg/s
export const FLYWHEEL_ACCEL = 160;                  // rps per s spinning up
export const FLYWHEEL_DECEL = 30;                   // rps per s coasting down
export const LAUNCH_LOCAL = [0.0, -0.078, 0.62];    // ball exit point relative to the turret axis (turret 0)
export const INTAKE_REACH = 0.69;                   // robot x of the front roller when deployed
export const INTAKE_HALF_WIDTH = 0.33;
export const EJECT_INTERVAL = 0.12;

export const MATCH_SECONDS = 160;                   // 20 s auto + 2:20 teleop
