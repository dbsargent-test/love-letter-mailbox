// =============================================================
// Love Letter Mailbox — 3D Printable Enclosure  (v2 — caliper-verified)
// Designed for Bambu P1S with AMS (multi-color)
// =============================================================
// ALL SNAP-FIT — no screws required.
// Dimensions caliper-measured 2026-08-31 by Doug.
// All Qwiic peripherals mount as PCBs, not bare components.
// =============================================================

// --- RENDERING CONTROL ---
//   "assembled" = full preview (not printable)
//   "body"      = main mailbox shell (print upside-down)
//   "door"      = front hinged door
//   "door_frame"= black trim overlay (AMS or separate)
//   "flag"      = flag arm + flag plate
//   "tray"      = internal component tray (slides in from front)
//   "sensor_bracket" = light sensor PCB bracket (top-mount)
render_part = "assembled";

// --- MAILBOX OVERALL DIMENSIONS ---
// Increased depth to fit 850mAh battery + three 25mm Qwiic boards
mailbox_length  = 110;   // front to back (depth)
mailbox_width   = 80;    // side to side (wider for battery + ESP side-by-side)
mailbox_height  = 58;    // straight wall height (below the curve)
wall_thickness  = 2.0;
corner_radius   = 3;

roof_radius = mailbox_width / 2;

// --- COMPONENT DIMENSIONS (caliper-measured 2026-08-31) ---

// SparkFun Thing Plus ESP32-C5 (WRL-30678)
esp_length   = 60;     // with USB-C connector
esp_width    = 23.5;
esp_height   = 15.5;   // board + soldered headers + tallest IC
usb_c_width  = 9;
usb_c_height = 3.2;
usb_c_offset_z = 1.5;  // center of USB-C from bottom of PCB

// Adafruit 2.0" TFT Display #4311 (via EYESPI FPC)
tft_pcb_width       = 59.2;
tft_pcb_height      = 35.5;
tft_pcb_depth       = 6;      // LCD + back-side components
tft_screen_width    = 48;     // full glass area (active pixels ~44mm)
tft_screen_height   = 34.5;   // viewable height

// Adafruit EYESPI Breakout #5613
eyespi_length = 25.4;
eyespi_width  = 17.7;
eyespi_height = 12;    // with soldered headers

// SG90 Micro Servo (caliper-measured)
servo_length = 22.5;
servo_width  = 12;
servo_height = 28;     // body only (no shaft)
servo_total_height = 30.8;  // body + shaft
servo_shaft_height = servo_total_height - servo_height;  // ~2.8mm above body
servo_tab_width = 32.3;
servo_tab_thickness = 2.5;
servo_tab_height_from_bottom = 16;

// SparkFun Qwiic Button (BOB-15932) — PCB with 12mm tactile button + red LED
qbtn_pcb_l     = 25;     // PCB length
qbtn_pcb_w     = 26;     // PCB width
qbtn_pcb_t     = 1.6;    // PCB thickness
qbtn_total_h   = 9.5;    // bottom of PCB to top of button cap
qbtn_cap_d     = 7;      // button cap diameter
qbtn_shaft_d   = 8.1;    // button shaft/housing diameter
qwiic_plug_w   = 6;      // Qwiic connector full width (all boards)
qwiic_plug_h   = 4.3;    // Qwiic connector height (pin side)

// SparkFun Ambient Light Sensor VEML6030 (SEN-15436) — Qwiic I2C board
lsens_pcb_l  = 25.4;
lsens_pcb_w  = 25.4;   // SQUARE (web said 12.7mm — wrong)
lsens_pcb_t  = 1.6;
lsens_total_h = 4.7;   // PCB + components, sensor nearly flush

// SparkFun Qwiic Buzzer (BOB-24474)
buzz_pcb_l   = 25.9;
buzz_pcb_w   = 25.9;
buzz_pcb_t   = 2.4;
buzz_total_h = 4.2;    // including buzzer dome
// Qwiic connectors on BOTH short edges — need clearance

// LiPo Battery 850mAh (PRT-13854)
battery_length = 43;
battery_width  = 33.5;
battery_height = 5.8;

// FPC cable clearance (18-pin EYESPI ribbon)
fpc_cable_width = 10;

// --- DOOR PARAMETERS ---
door_width  = tft_screen_width + 18;   // wider for TFT margin (+4mm vs before)
door_height = tft_screen_height + 38;  // +10mm for button PCB below display
door_recess = 1;
hinge_pin_d = 2.5;

// --- FLAG PARAMETERS ---
flag_arm_length = 30;
flag_arm_width  = 5;
flag_arm_thickness = 3;
flag_width  = 20;
flag_height = 12;
flag_thickness = 2;

// --- SNAP-FIT PARAMETERS ---
snap_lip      = 0.8;
snap_flex_len = 4;
snap_gap      = 0.3;
fit_tolerance = 0.3;

// --- COLORS ---
color_body       = [1, 1, 1];
color_door_frame = [0.1, 0.1, 0.1];
color_door_panel = [1, 1, 1];
color_flag       = [0.2, 0.7, 0.3];
color_internal   = [0.5, 0.5, 0.5];
color_sensor     = [0.6, 0.8, 0.6];   // light green accent for sensor bracket

// =============================================================
// SNAP-FIT PRIMITIVES
// =============================================================

module snap_clip(length, height, lip) {
    cube([1.2, length, height]);
    translate([0, 0, height - lip])
        cube([1.2 + lip, length, lip]);
}

// Rectangular PCB cradle — 4 corner posts with snap lips
module pcb_cradle(l, w, h, post_h) {
    gap = fit_tolerance;
    cl = l + 2*gap;
    cw = w + 2*gap;
    post = 1.5;
    // 4 corner posts
    for (px = [0, cl - post]) {
        for (py = [0, cw - post]) {
            translate([px, py, 0]) {
                cube([post, post, post_h]);
                // Inward snap lip at top
                lip_x = (px == 0) ? post - snap_lip : 0;
                lip_y = (py == 0) ? post - snap_lip : 0;
                translate([lip_x, lip_y, post_h - snap_lip])
                    cube([snap_lip, snap_lip, snap_lip]);
            }
        }
    }
}

// =============================================================
// MODULES
// =============================================================

// --- Rounded mailbox profile (2D cross-section) ---
module mailbox_profile(w, h) {
    hull() {
        translate([corner_radius, 0])
            square([w - 2*corner_radius, h]);
        translate([w/2, h])
            circle(r=w/2, $fn=80);
    }
}

// --- Main mailbox body (hollow shell) ---
module mailbox_body() {
    inner_w = mailbox_width - 2*wall_thickness;
    inner_l = mailbox_length - 2*wall_thickness;

    difference() {
        // Outer shell
        rotate([90, 0, 0])
        translate([0, 0, -mailbox_length])
        linear_extrude(height=mailbox_length)
            mailbox_profile(mailbox_width, mailbox_height);

        // Inner cavity
        rotate([90, 0, 0])
        translate([0, 0, -mailbox_length + wall_thickness])
        linear_extrude(height=mailbox_length - 2*wall_thickness)
            offset(r=-wall_thickness)
            mailbox_profile(mailbox_width, mailbox_height);

        // --- CUTOUTS ---

        // Front opening (door cutout) — centered horizontally, starts above tray
        translate([(mailbox_width - door_width)/2, -0.1, wall_thickness + 5])
            cube([door_width, wall_thickness + 0.2, door_height]);

        // USB-C cutout (back wall) — aligned with ESP32 on RIGHT side of tray
        // ESP32 center X (global) = tray_ox + (tray_w - esp_width - 5) + esp_width/2
        translate([
            (wall_thickness + fit_tolerance) + (mailbox_width - 2*wall_thickness - 2*fit_tolerance - esp_width - 5) + esp_width/2 - usb_c_width/2,
            mailbox_length - wall_thickness - 0.1,
            wall_thickness + 1.5 + usb_c_offset_z  // tray_height + USB offset
        ])
            cube([usb_c_width + 1, wall_thickness + 0.2, usb_c_height + 1]);

        // Servo shaft slot (right side wall)
        servo_y = mailbox_length * 0.35;
        translate([
            mailbox_width - wall_thickness - 0.1,
            servo_y + servo_length/2 - 5,
            wall_thickness + servo_tab_height_from_bottom - 2
        ])
            cube([wall_thickness + 0.2, 10, servo_shaft_height + 8]);

        // (Button is on the DOOR, not the body front wall)

        // Light sensor window (top of mailbox)
        // Rectangular slot for the VEML6030 sensor area (~10×10mm window)
        translate([
            mailbox_width * 0.65 - 6,
            mailbox_length * 0.25 - 6,
            mailbox_height + roof_radius - wall_thickness - 0.1
        ])
            cube([12, 12, wall_thickness + 1]);

        // Buzzer sound vents (bottom, 4×3 grid — aligned with buzzer on tray)
        // Buzzer tray position: x=5, y=bat_y+battery_length+2+eyespi_length+2 = 3+43+2+25.4+2 = 75.4
        // Global: x_center ≈ 2.3+5+13 = 20.3, y_center ≈ 2.3+75.4+13 = 90.7
        for (ix = [-2:2]) {
            for (iy = [-1:1]) {
                translate([
                    20 + ix*5,
                    91 + iy*5,
                    -0.1
                ])
                    cylinder(h=wall_thickness + 0.2, d=2.5, $fn=20);
            }
        }

        // Tray slide-in rails (grooves on inner left and right walls)
        tray_rail_z = wall_thickness;
        tray_rail_h = 1.5;
        for (side = [wall_thickness, mailbox_width - wall_thickness - 2]) {
            translate([side, wall_thickness, tray_rail_z])
                cube([2 + fit_tolerance, inner_l, tray_rail_h + fit_tolerance]);
        }

        // (Qwiic cables route internally — no wall pass-throughs needed)
    }

    // --- INTERNAL MOUNTS ---

    // Door hinge pins (left side of door opening)
    for (z_off = [wall_thickness + 6, wall_thickness + 4 + door_height]) {
        translate([(mailbox_width - door_width)/2 - 0.5, wall_thickness*0.5, z_off])
            difference() {
                cylinder(h=5, d=hinge_pin_d + 3, $fn=24);
                translate([0, 0, -0.1])
                    cylinder(h=5.2, d=hinge_pin_d + 2*snap_gap, $fn=24);
            }
    }

    // Servo cradle (inside right wall)
    servo_y = mailbox_length * 0.35;
    servo_z = wall_thickness + 5;
    servo_inner_x = mailbox_width - wall_thickness - servo_width - 1;

    // Bottom shelf
    translate([servo_inner_x, servo_y - 1, servo_z])
        cube([servo_width + 1, servo_length + 2, 1.5]);
    // Front tab wall + snap lip
    translate([servo_inner_x, servo_y - 1, servo_z + 1.5])
        cube([servo_width + 1, 2, servo_tab_height_from_bottom]);
    translate([servo_inner_x + 2, servo_y - 1, servo_z + 1.5 + servo_tab_height_from_bottom])
        cube([servo_width - 3, 2, snap_lip]);
    // Rear tab wall + snap lip
    translate([servo_inner_x, servo_y + servo_length - 1, servo_z + 1.5])
        cube([servo_width + 1, 2, servo_tab_height_from_bottom]);
    translate([servo_inner_x + 2, servo_y + servo_length - 1, servo_z + 1.5 + servo_tab_height_from_bottom])
        cube([servo_width - 3, 2, snap_lip]);

    // (Button PCB mounts on the door, not the body)

    // (Light sensor mounts via external sensor_bracket — no internal standoffs needed)

    // FPC cable routing clips (along inner left wall)
    for (y_pos = [mailbox_length * 0.3, mailbox_length * 0.5, mailbox_length * 0.7]) {
        translate([wall_thickness + 1, y_pos, wall_thickness + door_height - 3]) {
            cube([1.2, 4, 5]);
            translate([fpc_cable_width + 1.2, 0, 0])
                cube([1.2, 4, 5]);
            translate([0, 1, 5])
                cube([fpc_cable_width + 2.4, 2, 1]);
        }
    }
}

// --- Front door with display window + button ---
module mailbox_door() {
    // Button position: centered below display window
    btn_z = 11.5;  // PCB bottom at 1mm from door edge, top at 23.5mm (below display at 28mm)
    btn_x = door_width / 2;

    difference() {
        cube([door_width, wall_thickness - door_recess, door_height]);

        // Display window cutout (screen area visible)
        translate([
            (door_width - tft_screen_width)/2,
            -0.1,
            door_height - tft_screen_height - 10
        ])
            cube([tft_screen_width, wall_thickness + 0.2, tft_screen_height]);

        // Recess for black frame trim
        translate([
            (door_width - tft_screen_width)/2 - 3,
            -0.1,
            door_height - tft_screen_height - 13
        ])
            cube([tft_screen_width + 6, 0.7, tft_screen_height + 6]);

        // Button hole (below display, button shaft passes through door panel)
        translate([btn_x, -0.1, btn_z])
        rotate([-90, 0, 0])
            cylinder(h=wall_thickness + 0.2, d=qbtn_shaft_d + fit_tolerance*2, $fn=40);
    }

    // TFT snap-fit frame (inside face of door, holds the 59.2×35.5mm PCB)
    tft_x = (door_width - tft_pcb_width) / 2;
    tft_z = door_height - tft_pcb_height - 7;
    tft_frame_depth = tft_pcb_depth + 1.5;  // 6mm display + clearance

    // Bottom rail
    translate([tft_x - 0.5, wall_thickness - door_recess, tft_z - 1])
        cube([tft_pcb_width + 1, tft_frame_depth, 1]);
    // Top rail
    translate([tft_x - 0.5, wall_thickness - door_recess, tft_z + tft_pcb_height])
        cube([tft_pcb_width + 1, tft_frame_depth, 1]);
    // Left rail + snap lip
    translate([tft_x - 1, wall_thickness - door_recess, tft_z])
        cube([1, tft_frame_depth, tft_pcb_height]);
    translate([tft_x - 1, wall_thickness - door_recess + tft_frame_depth - snap_lip, tft_z + 5])
        cube([1 + snap_lip, snap_lip, tft_pcb_height - 10]);
    // Right rail + snap lip
    translate([tft_x + tft_pcb_width, wall_thickness - door_recess, tft_z])
        cube([1, tft_frame_depth, tft_pcb_height]);
    translate([tft_x + tft_pcb_width - snap_lip, wall_thickness - door_recess + tft_frame_depth - snap_lip, tft_z + 5])
        cube([1 + snap_lip, snap_lip, tft_pcb_height - 10]);

    // Qwiic Button PCB cradle (inside of door, below display)
    // PCB lays FLAT against inner door face, button cap pokes through hole
    // PCB: 25×26mm. Oriented with 26mm in X (horizontal), 25mm in Z (vertical)
    // Button at center of PCB → hole aligns at btn_x, btn_z
    qbtn_door_x = btn_x - 26/2;   // center 26mm dimension on button hole
    qbtn_door_z = btn_z - 25/2 + 2; // center 25mm dimension, slight upward bias
    qbtn_door_y = wall_thickness - door_recess;  // inner face of door

    // Floor ledge (PCB sits on this)
    translate([qbtn_door_x, qbtn_door_y, qbtn_door_z - 1])
        cube([26 + fit_tolerance, qbtn_total_h + 1, 1]);
    // Left wall
    translate([qbtn_door_x - 1.2, qbtn_door_y, qbtn_door_z])
        cube([1.2, qbtn_total_h + 1, 25]);
    // Right wall
    translate([qbtn_door_x + 26 + fit_tolerance, qbtn_door_y, qbtn_door_z])
        cube([1.2, qbtn_total_h + 1, 25]);
    // Top snap lip (holds PCB from sliding up)
    translate([qbtn_door_x + 3, qbtn_door_y, qbtn_door_z + 25])
        cube([20, snap_lip, snap_lip]);

    // Hinge barrels (snap onto body's hinge pins)
    for (z_off = [1, door_height - 6]) {
        translate([-2, (wall_thickness - door_recess)/2, z_off]) {
            difference() {
                cylinder(h=5, d=hinge_pin_d + 3 + 2*snap_gap, $fn=24);
                translate([0, 0, -0.1])
                    cylinder(h=5.2, d=hinge_pin_d + 2*snap_gap, $fn=24);
                translate([-5, -0.4, -0.1])
                    cube([10, 0.8, 5.2]);
            }
        }
    }

    // Door-closed friction bump
    translate([door_width/2, 0, 2])
        sphere(d=1.5, $fn=16);
}

// --- Black door frame trim (AMS second color) ---
module door_frame_trim() {
    frame_w = tft_screen_width + 6;
    frame_h = tft_screen_height + 6;
    frame_border = 3;
    frame_thickness = 0.6;

    difference() {
        cube([frame_w, frame_thickness, frame_h]);
        translate([frame_border, -0.1, frame_border])
            cube([frame_w - 2*frame_border, frame_thickness + 0.2, frame_h - 2*frame_border]);
    }
}

// --- Flag arm with flag plate ---
module mailbox_flag() {
    // Hub that press-fits onto SG90 servo horn (cross-shaped socket)
    difference() {
        cylinder(h=flag_arm_thickness + 1, d=8, $fn=30);
        translate([0, 0, -0.1]) {
            cube([2.2, 6, flag_arm_thickness + 1.2], center=true);
            cube([6, 2.2, flag_arm_thickness + 1.2], center=true);
        }
    }
    // Arm
    translate([0, -flag_arm_width/2, 0])
        cube([flag_arm_length, flag_arm_width, flag_arm_thickness]);
    // Flag plate
    translate([flag_arm_length - flag_thickness, -flag_width/2, 0])
        cube([flag_thickness, flag_width, flag_height]);
    // Reinforcement at hub junction
    translate([3, -flag_arm_width/2, 0])
        cube([2, flag_arm_width, flag_arm_thickness + 1]);
}

// --- Light sensor bracket (separate piece, snaps into top window) ---
// Holds the VEML6030 Qwiic board face-up with sensor exposed through window
// No longer a dome cap — it's a thin frame that grips the PCB edges
module sensor_bracket() {
    // Thin rectangular frame that press-fits into the top window opening
    // PCB sits inside, sensor chip faces up (exposed to light)
    frame_l = lsens_pcb_l + 3;
    frame_w = lsens_pcb_w + 3;
    frame_h = lsens_total_h + 2;  // enough to hold PCB + clearance
    wall = 1.2;

    difference() {
        cube([frame_l, frame_w, frame_h]);
        // PCB pocket
        translate([wall, wall, 1])
            cube([lsens_pcb_l + fit_tolerance, lsens_pcb_w + fit_tolerance, frame_h]);
    }
    // Snap lips on two sides to grip PCB
    for (dx = [wall, frame_l - wall - snap_lip]) {
        translate([dx, wall + 3, 1 + lsens_pcb_t])
            cube([snap_lip, 2, snap_lip]);
    }
    // Qwiic connector cutouts on two edges
    for (dy = [0, frame_w - wall]) {
        translate([frame_l/2 - qwiic_plug_w/2 - 1, dy - 0.1, 0])
            cube([qwiic_plug_w + 2, wall + 0.2, frame_h]);
    }
}

// --- Component tray (slides into body from front on rail grooves) ---
module component_tray() {
    tray_width  = mailbox_width - 2*wall_thickness - 2*fit_tolerance;
    tray_length = mailbox_length - 2*wall_thickness - 2*fit_tolerance;
    tray_height = 1.5;

    // Slide rails on edges
    cube([2, tray_length, tray_height]);
    translate([tray_width - 2, 0, 0])
        cube([2, tray_length, tray_height]);
    // Main platform
    translate([2, 0, 0])
        cube([tray_width - 4, tray_length, tray_height]);

    // ---- ESP32 CRADLE (RIGHT side, back — USB-C facing rear wall) ----
    esp_x = tray_width - esp_width - 5;
    esp_y = tray_length - esp_length - 3;

    // Side rails (hold PCB edges)
    translate([esp_x - 1.5, esp_y, tray_height])
        cube([1.5, esp_length, esp_height * 0.7]);
    translate([esp_x + esp_width + fit_tolerance, esp_y, tray_height])
        cube([1.5, esp_length, esp_height * 0.7]);
    // Front stop
    translate([esp_x, esp_y - 1.5, tray_height])
        cube([esp_width, 1.5, esp_height * 0.5]);
    // Rear snap clips
    for (dx = [esp_x + 3, esp_x + esp_width - 5]) {
        translate([dx, esp_y + esp_length, tray_height]) {
            cube([2, snap_flex_len, esp_height * 0.6]);
            translate([0, snap_flex_len - snap_lip, esp_height * 0.6])
                cube([2, snap_lip, snap_lip]);
        }
    }

    // ---- BATTERY BAY (LEFT side, front of tray) ----
    bat_x = 5;
    bat_y = 3;  // tight to front edge

    // Side walls
    translate([bat_x - 1.2, bat_y, tray_height])
        cube([1.2, battery_length, battery_height + 1]);
    translate([bat_x + battery_width + fit_tolerance, bat_y, tray_height])
        cube([1.2, battery_length, battery_height + 1]);
    // Front wall
    translate([bat_x, bat_y - 1, tray_height])
        cube([battery_width, 1, battery_height]);
    // Rear snap clips
    for (dx = [bat_x + 5, bat_x + battery_width - 7]) {
        translate([dx, bat_y + battery_length, tray_height]) {
            cube([2, 3, battery_height]);
            translate([0, 3 - snap_lip, battery_height])
                cube([2, snap_lip, snap_lip]);
        }
    }

    // ---- EYESPI BREAKOUT CRADLE (LEFT side, behind battery) ----
    eyespi_x = 5;
    eyespi_y = bat_y + battery_length + 2;  // 2mm gap after battery

    // Side rails
    translate([eyespi_x - 1.2, eyespi_y, tray_height])
        cube([1.2, eyespi_length, eyespi_height + 1]);
    translate([eyespi_x + eyespi_width, eyespi_y, tray_height])
        cube([1.2, eyespi_length, eyespi_height + 1]);
    // Front stop
    translate([eyespi_x, eyespi_y - 1, tray_height])
        cube([eyespi_width, 1, eyespi_height * 0.6]);
    // Rear snap clip
    translate([eyespi_x + eyespi_width/2 - 1, eyespi_y + eyespi_length, tray_height]) {
        cube([2, 3, eyespi_height]);
        translate([0, 3 - snap_lip, eyespi_height])
            cube([2, snap_lip, snap_lip]);
    }

    // ---- QWIIC BUZZER CRADLE (LEFT side, behind EYESPI — under sound vents) ----
    // PCB lays flat, buzzer dome faces down toward vent holes in body floor
    buz_x = 5;
    buz_y = eyespi_y + eyespi_length + 2;  // 2mm gap after EYESPI

    // Four corner posts for 25.9×25.9mm PCB
    for (cx = [-1, buzz_pcb_l + fit_tolerance]) {
        for (cy = [-1, buzz_pcb_w + fit_tolerance]) {
            translate([buz_x + cx, buz_y + cy, tray_height])
                cube([1.5, 1.5, buzz_total_h + 1]);
        }
    }
    // Two snap lips on opposite corners
    translate([buz_x - 1, buz_y + buzz_pcb_w/2 - 1, tray_height + buzz_total_h])
        cube([1.5, 2, snap_lip]);
    translate([buz_x + buzz_pcb_l + fit_tolerance, buz_y + buzz_pcb_w/2 - 1, tray_height + buzz_total_h])
        cube([1.5, 2, snap_lip]);
    // Qwiic connector clearance notches on two edges
    // (connectors are on both short edges of buzzer PCB)

    // ---- TRAY FRONT STOP ----
    translate([tray_width/2 - 3, tray_length - 2, 0])
        cube([6, 2, tray_height + 1]);

}

// =============================================================
// ASSEMBLY / RENDER
// =============================================================
// PRINT QUANTITIES (building 2 mailboxes):
//   body             ×2  (White PLA)
//   door             ×2  (White PLA)
//   door_frame       ×2  (Black PLA — AMS or separate)
//   flag             ×2  (Green PLA)
//   tray             ×2  (Gray PLA)
//   sensor_bracket   ×2  (Gray PLA or White PLA)
// Total: 12 parts (all PLA — no separate PETG print needed)

if (render_part == "assembled") {
    color(color_body)
        mailbox_body();

    color(color_door_panel)
    translate([(mailbox_width - door_width)/2, 0, wall_thickness + 5])
        mailbox_door();

    color(color_door_frame)
    translate([
        (mailbox_width - door_width)/2 + (door_width - tft_screen_width)/2 - 3,
        -0.1,
        wall_thickness + 5 + door_height - tft_screen_height - 13
    ])
        door_frame_trim();

    color(color_flag)
    translate([
        mailbox_width + 2,
        mailbox_length * 0.35 + servo_length/2,
        wall_thickness + 5 + servo_tab_height_from_bottom
    ])
    rotate([0, 90, 0])
        mailbox_flag();

    color(color_internal)
    translate([wall_thickness + fit_tolerance, wall_thickness + fit_tolerance, wall_thickness])
        component_tray();

    color(color_sensor)
    translate([
        mailbox_width * 0.65 - lsens_pcb_l/2 - 1,
        mailbox_length * 0.25 - lsens_pcb_w/2 - 1,
        mailbox_height + roof_radius - wall_thickness - 0.5
    ])
        sensor_bracket();
}

if (render_part == "body") mailbox_body();
if (render_part == "door") mailbox_door();
if (render_part == "door_frame") door_frame_trim();
if (render_part == "flag") mailbox_flag();
if (render_part == "tray") component_tray();
if (render_part == "sensor_bracket") sensor_bracket();

// --- Batch layout for Bambu P1S ---
if (render_part == "all_pla") {
    for (i = [0:1]) {
        x_off = i * (mailbox_width + 15);

        translate([x_off, 0, 0])
            mailbox_body();
        translate([x_off, mailbox_length + 10, 0])
            mailbox_door();
        translate([x_off, mailbox_length + door_height + 20, 0])
            door_frame_trim();
        translate([x_off + mailbox_width + 5, 0, 0])
            mailbox_flag();
        translate([x_off, -50, 0])
            component_tray();
        translate([x_off + mailbox_width + 5, -50, 0])
            sensor_bracket();
    }
}
