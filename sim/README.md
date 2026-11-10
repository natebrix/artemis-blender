# ARTEMIS simulator

Drive ARTEMIS on the 2026 REBUILT field in a browser: collect fuel, auto-aim and shoot into the hub.
It is a static site with no build step.

## Run it

Online, once GitHub Pages is enabled for this repository (Settings → Pages → *Deploy from a branch* → `main`, folder `/ (root)`):
`https://natebrix.github.io/artemis-blender/sim/`

Locally, from the repository root:

```bash
python3 -m http.server 8000 --directory sim
```

Then open `http://localhost:8000`. Opening `index.html` straight from disk does not work, because browsers block module loading from `file://`.

## Controls

One Xbox-style controller, also mapped to the keyboard. The layout follows the team's single-controller layout in `RobotContainer.java`.

| Keyboard | Controller | Action |
| --- | --- | --- |
| W A S D | Left stick | Drive, field-relative (W is away from the driver station) |
| ← → or Q E | Right stick | Rotate |
| Space | RT | Shoot (hold) |
| Shift | LT | Intake: deploy and run (hold) |
| Y | Y | Stow intake |
| G | RB | Eject fuel out of the intake (hold) |
| R | LB | Reverse feeder and indexer (hold) |
| X | X | X-brake (hold) |
| F | A | Trench align (hold) |
| B | B | Reset field-relative heading |
| T | Start | Toggle auto-aim |
| Backspace | Back | Reset mechanisms |
| I J K L | D-pad | Nudge at 0.25 m/s, robot-relative |
| C or 1–4 | | Camera: driver station, follow, overhead, chase |
| Enter / P / H | | Restart match / pause / help |

Keyboard rotation runs at 40% of full rate, because a key is all-or-nothing and the robot's full 11 rad/s is unmanageable that way. A controller stick gives the full range.

## What is simulated

* **Field.** Dimensions come from `FuelSim.java` in the robot code: 16.51 × 8.04 m, both hubs with their backstop nets, the four bumps, the four trenches, and the starting fuel (360 in the neutral zone, 24 in each depot).
* **Fuel physics.** A JavaScript port of the team's `FuelSim.java`: gravity, air drag, bounces off the floor, bumps, walls, hubs, nets and trenches, ball-to-ball collisions, and being pushed by the robot. A ball scores when it drops through the hub opening, then rolls back out into the neutral zone.
* **Driving.** Field-relative swerve with the code's limits: 4.39 m/s, 11.0 rad/s, 600 in/s² acceleration, 6% stick deadband. The robot rides over the bumps, fits under the trench bars, and is stopped by the walls, hubs and trench blocks.
* **Shooting.** The turret tracks the hub while you are on your side of it, and a pass target when you are beyond it, as in `AutoAimController`. The solver picks the lowest launch angle that drops the ball into the hub, allowing for air drag and the robot's own motion. Fuel is fired when the flywheel is at speed, the turret and hood are on target, and the robot is level. The hood drops for the trenches.
* **Robot model.** A 225k-triangle copy of `ARTEMIS.blend` with the same joints, made by `export_web.py`.

`js/constants.js` lists every number and marks each one as taken from the code or estimated.

## Limits

* **Estimated values.** The code doesn't give these in plain units, so they are estimates: hopper capacity (40), turret, hood and intake-pivot speeds, flywheel spin-up time, and where exactly the ball leaves the shooter.
* **Tolerances.** The simulator waits for the turret to be within 1.5° and the hood within 1° before firing. The robot code allows 7.5° and 4°.
* **Match rules.** The clock is 2:40 and you drive for all of it; there is no autonomous period. Every fuel in the blue hub counts as one. Hub active/inactive shifts, the tower climb, the outposts and human players are not modelled.
* **One robot.** No partners or opponents.
* **Fuel on the robot.** Fuel above bumper height that lands on the robot is caught by the hopper. Fuel in the hopper is shown but not simulated.
* **Not tested with a physical controller.** The controller mapping uses the browser's standard gamepad layout but was only tested with the keyboard.

## Updating the robot model

After rebuilding `ARTEMIS.blend`:

```bash
python export_web.py
```

```bash
cp artemis_joints.json sim/assets/
```
