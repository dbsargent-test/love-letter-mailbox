// Love Letter Mailbox v2 - three-part, bottom-serviceable enclosure.

render_part = "assembled";
$fn = 48;
eps = 0.05;

// Envelope
mailbox_length = 110;
mailbox_width = 80;
straight_wall_h = 58;
roof_radius = 40;
wall = 2.4;

// Measured electronics
esp_length = 60;
esp_width = 23.5;
esp_height = 15.5;
usb_width = 9;
usb_height = 3.2;

tft_pcb_width = 59.2;
tft_pcb_height = 35.5;
tft_depth = 6;
tft_screen_width = 48;
tft_screen_height = 34.5;

eyespi_length = 25.4;
eyespi_width = 17.7;
eyespi_height = 12;

servo_body_y = 22.5;
servo_body_x = 12;
servo_body_z = 28;
servo_total_z = 30.8;
servo_tab_span = 32.3;
servo_pivot_above_bottom = 16;

qbtn_pcb_x = 26;
qbtn_pcb_z = 25;
qbtn_shaft_d = 8.1;
qbtn_total_depth = 9.5;

sensor_pcb_x = 25.4;
sensor_pcb_y = 25.4;
sensor_total_z = 4.7;

buzzer_x = 25.9;
buzzer_y = 25.9;
buzzer_z = 4.2;

battery_x = 35.5;
battery_y = 45;
battery_z = 5.8;

// Fits
rigid_clearance = 0.4;
tft_pocket_x = 60.0;
tft_pocket_z = 36.3;
tft_pocket_depth = 6.8;
sensor_pocket_x = 26.2;
sensor_pocket_y = 26.2;
sensor_pocket_z = 5.2;

// Floor and snap system
floor_t = 2.8;
floor_edge_gap = 0.15;
tongue_clearance = 0.3;
tongue_t = 1.8;
tongue_h = 4.2;
snap_h = 7.4;
snap_w = 8;
snap_y_positions = [38, 70];

// Layout datums
tft_center_z = 37.1;
button_center_z = 11.5;
servo_pivot_y = 68;
servo_pivot_z = 54;
sensor_center_y = mailbox_length / 2;

floor_esp_x = 51.5;
floor_esp_y = 44.5;
floor_battery_x = 5;
floor_battery_y = 18;
floor_eyespi_x = 55.2;
floor_eyespi_y = 16.5;
floor_buzzer_x = 7;
floor_buzzer_y = 76;

// Flag and typical SG90 stock horn assumptions
flag_t = 4.5;
flag_arm_length = 34;
flag_arm_w = 7;
flag_plate_x = 16;
flag_plate_y = 20;
horn_recess_depth = 2.0;
horn_boss_d = 7.8;
horn_arm_w = 3.5;
horn_long_r = 16;
horn_short_r = 7;
horn_cross_r = 7;
horn_screw_d = 2.2;
flag_wall_gap = 0.3;

color_housing = [0.95, 0.95, 0.95];
color_floor = [0.38, 0.40, 0.43];
color_flag = [0.18, 0.68, 0.27];

assert(wall >= 2.4, "Housing wall must remain structural.");
assert(tft_pocket_x >= tft_pcb_width + 0.8, "TFT pocket is undersized.");
assert(sensor_pocket_x >= sensor_pcb_x + 0.8, "Sensor pocket is undersized.");
assert(servo_pivot_z - servo_pivot_above_bottom >= 36,
       "Servo mount is not elevated.");

module rounded_rect_2d(x, y, r) {
    hull()
        for (px = [r, x - r])
            for (py = [r, y - r])
                translate([px, py]) circle(r = r);
}

// Analytic profile: full-width vertical walls topped by an upper semicircle.
module mailbox_profile_2d() {
    union() {
        square([mailbox_width, straight_wall_h + eps]);
        intersection() {
            translate([mailbox_width / 2, straight_wall_h])
                circle(r = roof_radius);
            translate([0, straight_wall_h])
                square([mailbox_width, roof_radius + eps]);
        }
    }
}

module mailbox_inner_profile_2d() {
    inner_r = roof_radius - wall;
    union() {
        translate([wall, -1])
            square([mailbox_width - 2 * wall, straight_wall_h + 1 + eps]);
        intersection() {
            translate([mailbox_width / 2, straight_wall_h])
                circle(r = inner_r);
            translate([wall, straight_wall_h])
                square([mailbox_width - 2 * wall, inner_r + eps]);
        }
    }
}

module cassette_limit_profile_2d() {
    limit_r = roof_radius - wall + 0.2;
    union() {
        translate([wall, -1])
            square([mailbox_width - 2 * wall, straight_wall_h + 1 + eps]);
        intersection() {
            translate([mailbox_width / 2, straight_wall_h])
                circle(r = limit_r);
            translate([wall, straight_wall_h])
                square([mailbox_width - 2 * wall, limit_r + eps]);
        }
    }
}

module profile_prism(length, inner = false) {
    translate([0, length, 0])
        rotate([90, 0, 0])
            linear_extrude(height = length, convexity = 10)
                if (inner) mailbox_inner_profile_2d();
                else mailbox_profile_2d();
}

module cassette_limit_prism() {
    translate([0, mailbox_length, 0])
        rotate([90, 0, 0])
            linear_extrude(height = mailbox_length, convexity = 10)
                cassette_limit_profile_2d();
}

module front_aperture_cuts() {
    window_x = tft_screen_width + 0.2;
    window_z = tft_screen_height + 0.2;
    translate([(mailbox_width - window_x) / 2, -eps,
               tft_center_z - window_z / 2])
        cube([window_x, wall + 2 * eps, window_z]);

    translate([mailbox_width / 2, -eps, button_center_z])
        rotate([-90, 0, 0])
            cylinder(h = wall + 2 * eps,
                     d = qbtn_shaft_d + 0.4);
}

module servo_and_service_cuts() {
    translate([mailbox_width - wall - eps, servo_pivot_y, servo_pivot_z])
        rotate([0, 90, 0])
            cylinder(h = wall + 2 * eps, d = 8.8);

    // Rear notch remains open to the bottom so the populated floor moves straight up.
    usb_center_x = floor_esp_x + esp_width / 2;
    translate([usb_center_x - (usb_width + 2) / 2,
               mailbox_length - wall - eps, -eps])
        cube([usb_width + 2, wall + 2 * eps, 12.0]);

    // Low side vents preserve the bottom seam and do not depend on buzzer alignment.
    for (yy = [78, 88, 98])
        translate([-eps, yy - 3.5, 14])
            cube([wall + 2 * eps, 7, 2.4]);
}

module sensor_roof_cut() {
    // The opening crosses the full roof skin over the sensor IC.
    translate([mailbox_width / 2 - 4.5, sensor_center_y - 4.5,
               straight_wall_h + roof_radius - wall - 0.5])
        cube([9, 9, wall + 1.2]);
}

module housing_snap_recesses() {
    for (yy = snap_y_positions) {
        translate([wall - 1.15, yy - snap_w / 2 - 0.4, 5.35])
            cube([1.25, snap_w + 0.8, 2.25]);
        translate([mailbox_width - wall - 0.1,
                   yy - snap_w / 2 - 0.4, 5.35])
            cube([1.25, snap_w + 0.8, 2.25]);
    }
}

module tft_cradle() {
    x0 = (mailbox_width - tft_pocket_x) / 2;
    x1 = x0 + tft_pocket_x;
    z0 = tft_center_z - tft_pocket_z / 2;
    z1 = z0 + tft_pocket_z;
    y0 = wall - 0.15;
    y1 = wall + tft_pocket_depth;
    rail = 1.8;
    keeper = 1.4;

    // Left guide and rear keeper.
    translate([x0 - rail, y0, z0 - 0.5])
        cube([rail, tft_pocket_depth + 1.4, tft_pocket_z + 1.0]);
    translate([x0 - rail, y1, z0 - 0.5])
        cube([rail + 3.8, keeper, tft_pocket_z + 1.0]);

    // Right guide is split to give the 10 mm FPC a side exit and bend volume.
    for (zr = [[z0 - 0.5, 7.3], [z0 + 20.0, z1 - (z0 + 20.0) + 0.5]]) {
        translate([x1, y0, zr[0]])
            cube([rail, tft_pocket_depth + 1.4, zr[1]]);
        translate([x1 - 2.0, y1, zr[0]])
            cube([rail + 2.0, keeper, zr[1]]);
    }

    // Top stop establishes screen alignment while leaving the bottom open.
    translate([x0 - rail, y0, z1])
        cube([tft_pocket_x + 2 * rail, tft_pocket_depth + 1.4, 1.8]);

    // Two printable vertical fingers retain the lower PCB edge.
    for (xx = [x0 + 3, x1 - 8]) {
        translate([xx, y1 + 0.05, 7.5])
            cube([5, 1.35, z0 - 7.5]);
        hull() {
            translate([xx, y1 + 0.05, z0 - 1.7])
                cube([5, 1.35, 0.2]);
            translate([xx, y1 - 0.85, z0 - 0.55])
                cube([5, 2.25, 0.55]);
        }
    }
}

module button_cradle() {
    pocket_x = qbtn_pcb_x + 0.8;
    pocket_z = qbtn_pcb_z + 0.8;
    x0 = (mailbox_width - pocket_x) / 2;
    x1 = x0 + pocket_x;
    z0 = 0.8;
    z1 = z0 + pocket_z;
    y0 = wall + tft_pocket_depth + 0.45;
    y1 = y0 + 3.8;
    rail = 1.6;

    // Split side rails leave independent left/right Qwiic cable paths.
    for (zr = [[z0, 5.0], [z0 + 13.0, z1 - (z0 + 13.0)]]) {
        translate([x0 - rail, y0, zr[0]])
            cube([rail, y1 - y0, zr[1]]);
        translate([x1, y0, zr[0]])
            cube([rail, y1 - y0, zr[1]]);
    }

    // Rear corner keepers provide positive depth retention without blocking cables.
    for (xx = [x0 - rail, x1 - 3.5])
        translate([xx, y1 - 1.35, z0])
            cube([5.1, 1.35, pocket_z]);

    translate([x0 - rail, y0, z1])
        cube([pocket_x + 2 * rail, y1 - y0, 1.6]);

    for (xx = [x0 + 1.5, x1 - 5.5]) {
        translate([xx, y1 - 1.3, 0])
            cube([4, 1.3, z0 + 0.25]);
        translate([xx, y1 - 1.3, z0])
            cube([4, 2.1, 0.8]);
    }
}

module servo_mount() {
    body_y0 = servo_pivot_y - 5.8 - rigid_clearance;
    body_y1 = body_y0 + servo_body_y + 2 * rigid_clearance;
    body_x0 = mailbox_width - wall - servo_body_x - 2 * rigid_clearance;
    body_z0 = servo_pivot_z - servo_pivot_above_bottom - rigid_clearance;
    body_z1 = body_z0 + servo_body_z + 2 * rigid_clearance;
    rib = 1.8;

    // The cage is open below. The servo travels vertically into these guides.
    for (yy = [body_y0 - rib, body_y1])
        translate([body_x0 - 1.8, yy, body_z0 - 0.6])
            cube([mailbox_width - wall - body_x0 + 1.95,
                  rib, body_z1 - body_z0 + 1.2]);

    // Inner keepers stop the body moving away from the side wall.
    for (yy = [body_y0 + 2, body_y1 - 6])
        translate([body_x0 - 1.8, yy, body_z0])
            cube([1.8, 4, body_z1 - body_z0]);

    translate([body_x0 - 1.8, body_y0 - rib, body_z1])
        cube([mailbox_width - wall - body_x0 + 1.95,
              body_y1 - body_y0 + 2 * rib, 2.0]);

    // Bottom latches are 1.8 mm thick and 8 mm long, not fragile film tabs.
    for (yy = [body_y0 + 1.0, body_y1 - 5.5]) {
        translate([body_x0 - 1.8, yy, body_z0 - 8])
            cube([1.8, 4.5, 8.1]);
        hull() {
            translate([body_x0 - 1.8, yy, body_z0 - 1.1])
                cube([1.8, 4.5, 0.2]);
            translate([body_x0 - 0.8, yy, body_z0 - 0.1])
                cube([1.0, 4.5, 0.6]);
        }
    }

    // Broad tab datum shelf; the 32.3 mm ears remain cable-accessible.
    tab_y0 = (body_y0 + body_y1 - servo_tab_span) / 2;
    translate([body_x0 - 1.8, tab_y0, servo_pivot_z - 1.0])
        cube([3.0, servo_tab_span, 2.0]);
}

module sensor_cassette() {
    inner_roof_z = straight_wall_h + roof_radius - wall;
    pocket_top_z = straight_wall_h
        + sqrt(pow(roof_radius - wall, 2)
               - pow(sensor_pocket_x / 2, 2)) - 0.25;
    z0 = pocket_top_z - sensor_pocket_z;
    skirt_z0 = z0 - 1.2;
    x0 = mailbox_width / 2 - sensor_pocket_x / 2;
    x1 = x0 + sensor_pocket_x;
    y0 = sensor_center_y - sensor_pocket_y / 2;
    y1 = y0 + sensor_pocket_y;
    rail = 1.7;

    intersection() {
        union() {
            translate([x0 - rail, y0 - rail, skirt_z0])
                cube([rail, sensor_pocket_y + 2 * rail,
                      inner_roof_z - skirt_z0 + 0.4]);
            translate([x1, y0 - rail, skirt_z0])
                cube([rail, sensor_pocket_y + 2 * rail,
                      inner_roof_z - skirt_z0 + 0.4]);
        }
        cassette_limit_prism();
    }

    // Front and rear rails stop below the curved skin and are split for
    // either Qwiic connector direction.
    for (yy = [y0 - rail, y1])
        for (xx = [[x0 - rail, 9.0],
                   [mailbox_width / 2 + 5.0,
                    x1 + rail - (mailbox_width / 2 + 5.0)]])
            translate([xx[0], yy, skirt_z0])
                cube([xx[1], rail, pocket_top_z - skirt_z0]);

    // Four small lips prevent lift and tilt; the side skirts flex during insertion.
    for (yy = [y0 + 2.0, y1 - 7.0]) {
        translate([x0 - rail, yy, skirt_z0])
            cube([rail + 1.2, 5.0, 1.2]);
        translate([x1 - 1.2, yy, skirt_z0])
            cube([rail + 1.2, 5.0, 1.2]);
    }
}

module housing() {
    union() {
        difference() {
            profile_prism(mailbox_length);
            translate([0, wall, 0])
                profile_prism(mailbox_length - 2 * wall, true);
            front_aperture_cuts();
            servo_and_service_cuts();
            sensor_roof_cut();
            housing_snap_recesses();
        }
        tft_cradle();
        button_cradle();
        servo_mount();
        sensor_cassette();
    }
}

module floor_plate() {
    difference() {
        translate([floor_edge_gap, floor_edge_gap, 0])
            linear_extrude(height = floor_t)
                rounded_rect_2d(mailbox_width - 2 * floor_edge_gap,
                                mailbox_length - 2 * floor_edge_gap, 2.2);

        // Opposed scallops expose the seam for deliberate removal.
        for (xx = [floor_edge_gap, mailbox_width - floor_edge_gap])
            translate([xx, mailbox_length / 2, -eps])
                cylinder(h = floor_t + 2 * eps, d = 9);
    }
}

module tongue_segments() {
    x0 = wall + tongue_clearance;
    x1 = mailbox_width - wall - tongue_clearance;
    y0 = wall + tongue_clearance;
    y1 = mailbox_length - wall - tongue_clearance;
    z0 = floor_t - 0.1;

    // Front, sides, and a split rear tongue locate the floor without slide rails.
    translate([x0, y0, z0])
        cube([x1 - x0, tongue_t, tongue_h + 0.1]);
    side_ranges = [
        [y0, snap_y_positions[0] - snap_w / 2 - 0.3],
        [snap_y_positions[0] + snap_w / 2 + 0.3,
         snap_y_positions[1] - snap_w / 2 - 0.3],
        [snap_y_positions[1] + snap_w / 2 + 0.3, y1]
    ];
    for (rr = side_ranges) {
        translate([x0, rr[0], z0])
            cube([tongue_t, rr[1] - rr[0], tongue_h + 0.1]);
        translate([x1 - tongue_t, rr[0], z0])
            cube([tongue_t, rr[1] - rr[0], tongue_h + 0.1]);
    }

    usb_center_x = floor_esp_x + esp_width / 2;
    translate([x0, y1 - tongue_t, z0])
        cube([usb_center_x - 7 - x0, tongue_t, tongue_h + 0.1]);
    translate([usb_center_x + 7, y1 - tongue_t, z0])
        cube([x1 - (usb_center_x + 7), tongue_t, tongue_h + 0.1]);

    // Four tiny preload pads remove rattle without changing the rigid tongue fit.
    for (p = [[x0 - 0.15, 18], [x1 - tongue_t, 88]])
        translate([p[0], p[1], floor_t + 1.2])
            cube([tongue_t + 0.15, 5, 0.35]);
}

module side_snap_finger(side, yy) {
    x0 = wall + tongue_clearance;
    x1 = mailbox_width - wall - tongue_clearance;
    beam = 1.6;
    lip = 0.9;
    points_left = [
        [x0, 0], [x0 + beam, 0], [x0 + beam, snap_h],
        [x0, snap_h], [x0 - lip, snap_h - 1.1],
        [x0, snap_h - 1.9]
    ];
    points_right = [
        [x1 - beam, 0], [x1, 0], [x1, snap_h - 1.9],
        [x1 + lip, snap_h - 1.1], [x1, snap_h],
        [x1 - beam, snap_h]
    ];

    translate([0, yy + snap_w / 2, floor_t - 0.1])
        rotate([90, 0, 0])
            linear_extrude(height = snap_w)
                polygon(points = side == "left" ? points_left : points_right);
}

module pcb_side_clip(edge_x, yy, side, board_bottom) {
    beam = 1.6;
    clip_w = 6;
    clip_h = board_bottom + 2.7;
    if (side == "left") {
        translate([edge_x - beam, yy - clip_w / 2, floor_t - 0.1])
            cube([beam, clip_w, clip_h + 0.1]);
        translate([edge_x - beam, yy - clip_w / 2,
                   floor_t + board_bottom + 1.45])
            cube([beam + 0.8, clip_w, 0.8]);
    } else {
        translate([edge_x, yy - clip_w / 2, floor_t - 0.1])
            cube([beam, clip_w, clip_h + 0.1]);
        translate([edge_x - 0.8, yy - clip_w / 2,
                   floor_t + board_bottom + 1.45])
            cube([beam + 0.8, clip_w, 0.8]);
    }
}

module pcb_mount(x, y, bx, by, clip_y1, clip_y2) {
    c = rigid_clearance;
    board_bottom = 1.2;
    x0 = x - c;
    x1 = x + bx + c;
    y0 = y - c;
    y1 = y + by + c;

    for (px = [x + 2.5, x + bx - 2.5])
        for (py = [y + 2.5, y + by - 2.5])
            translate([px, py, floor_t])
                translate([0, 0, -0.1])
                    cylinder(h = board_bottom + 0.1, d = 3.0);

    // Low rounded corner locators avoid connector edges and exposed components.
    for (px = [x0 - 1.2, x1 + 1.2])
        for (py = [y0 - 1.2, y1 + 1.2])
            translate([px, py, floor_t - 0.1])
                cylinder(h = board_bottom + 2.3, d = 2.4);

    pcb_side_clip(x0, clip_y1, "left", board_bottom);
    pcb_side_clip(x1, clip_y2, "right", board_bottom);
}

module battery_bay() {
    x0 = floor_battery_x;
    x1 = x0 + battery_x;
    y0 = floor_battery_y;
    y1 = y0 + battery_y;
    post_h = battery_z + 1.2;

    // Rounded corner cups define a 35.5 x 45 x 7 mm non-compressive envelope.
    for (p = [[x0, y0, 1, 1], [x1, y0, -1, 1],
              [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
        arm_x = p[3] < 0 ? 6.6 : 7.0;
        translate([p[0], p[1], floor_t - 0.1])
            cylinder(h = post_h + 0.1, d = 3.2);
        translate([p[0] - (p[2] < 0 ? arm_x : 0),
                   p[1] - 0.8, floor_t - 0.1])
            cube([arm_x, 1.6, post_h + 0.1]);
        translate([p[0] - 0.8,
                   p[1] - (p[3] < 0 ? 7 : 0), floor_t - 0.1])
            cube([1.6, 7, post_h + 0.1]);
    }

    // Two corner roofs sit 1.0 mm above the measured cell, never on the pouch.
    for (yy = [y0, y1 - 3])
        translate([x0 - 0.8, yy, floor_t + battery_z + 1.0])
            cube([3.2, 3.0, 1.0]);
}

module electronics_mounts() {
    battery_bay();

    pcb_mount(floor_eyespi_x, floor_eyespi_y,
              eyespi_width, eyespi_length, 14, 27);
    pcb_mount(floor_buzzer_x, floor_buzzer_y,
              buzzer_x, buzzer_y, 83, 95);
    pcb_mount(floor_esp_x, floor_esp_y,
              esp_width, esp_length, 58, 94);
}

module floor_tray() {
    union() {
        floor_plate();
        tongue_segments();
        for (yy = snap_y_positions) {
            side_snap_finger("left", yy);
            side_snap_finger("right", yy);
        }
        electronics_mounts();
    }
}

module servo_flag() {
    difference() {
        union() {
            cylinder(h = flag_t, d = 18);
            translate([4, -flag_arm_w / 2, 0])
                cube([flag_arm_length - 4, flag_arm_w, flag_t]);
            translate([flag_arm_length - 4, -flag_plate_y / 2, 0])
                cube([flag_plate_x, flag_plate_y, 3.2]);
            hull() {
                translate([6, -flag_arm_w / 2, 0])
                    cube([3, flag_arm_w, flag_t]);
                translate([flag_arm_length, -flag_plate_y / 2, 0])
                    cube([2, flag_plate_y, 3.2]);
            }
        }

        // A stock SG90 horn nests in the wall-facing side and uses its center screw.
        translate([0, 0, flag_t - horn_recess_depth]) {
            cylinder(h = horn_recess_depth + eps, d = horn_boss_d);
            translate([(horn_long_r - horn_short_r) / 2, 0,
                       horn_recess_depth / 2])
                cube([horn_long_r + horn_short_r, horn_arm_w,
                      horn_recess_depth + eps], center = true);
            translate([0, 0, horn_recess_depth / 2])
                cube([horn_arm_w, 2 * horn_cross_r,
                      horn_recess_depth + eps], center = true);
        }
        translate([0, 0, -eps])
            cylinder(h = flag_t + 2 * eps, d = horn_screw_d);
    }
}

module place_flag(angle = 0) {
    // angle 0 is raised; -90 points toward the front.
    translate([mailbox_width + flag_wall_gap + flag_t,
               servo_pivot_y, servo_pivot_z])
        rotate([0, -90, 0])
            rotate([0, 0, angle])
                servo_flag();
}

module floor_component_keepouts() {
    color([0.2, 0.5, 0.9, 0.35])
        translate([floor_esp_x, floor_esp_y, 1.2])
            cube([esp_width, esp_length, esp_height]);
    color([0.9, 0.6, 0.1, 0.35])
        translate([floor_battery_x, floor_battery_y, 0])
            cube([battery_x, battery_y, battery_z]);
    color([0.7, 0.2, 0.8, 0.35])
        translate([floor_eyespi_x, floor_eyespi_y, 1.2])
            cube([eyespi_width, eyespi_length, eyespi_height]);
    color([0.8, 0.2, 0.2, 0.35])
        translate([floor_buzzer_x, floor_buzzer_y, 1.2])
            cube([buzzer_x, buzzer_y, buzzer_z]);
}

module component_keepouts() {
    floor_component_keepouts();
    body_y0 = servo_pivot_y - 5.8;
    color([0.1, 0.7, 0.7, 0.35])
        translate([mailbox_width - wall - servo_body_x,
                   body_y0, servo_pivot_z - servo_pivot_above_bottom])
            cube([servo_body_x, servo_body_y, servo_body_z]);
}

module assembled(show_keepouts = false) {
    color(color_housing) housing();
    color(color_floor) translate([0, 0, -floor_t]) floor_tray();
    color(color_flag) place_flag(0);
    if (show_keepouts)
        translate([0, 0, 0]) component_keepouts();
}

module tft_coupon() {
    translate([-6, 0, -17])
        intersection() {
            housing();
            translate([6, -eps, 17])
                cube([68, 14.5, 40]);
        }
}

module snap_housing_coupon() {
    translate([0, -(snap_y_positions[0] - 7), 0])
        intersection() {
            housing();
            translate([-eps, snap_y_positions[0] - 7, -eps])
                cube([8, 14, 12]);
        }
}

module snap_floor_coupon() {
    translate([0, -(snap_y_positions[0] - 7), 0])
        intersection() {
            floor_tray();
            translate([-eps, snap_y_positions[0] - 7, -eps])
                cube([9, 14, 12]);
        }
}

module horn_coupon() {
    translate([9, 9, 0])
        intersection() {
            servo_flag();
            translate([-9, -9, -eps])
                cube([18, 18, flag_t + 2 * eps]);
        }
}

if (render_part == "housing") housing();
if (render_part == "floor") floor_tray();
if (render_part == "flag") servo_flag();
if (render_part == "assembled") assembled(false);

if (render_part == "print_layout") {
    housing();
    translate([95, 0, 0]) floor_tray();
    translate([100, 122, 0]) servo_flag();
}

if (render_part == "section") {
    intersection() {
        assembled(true);
        translate([-5, -5, -5])
            cube([mailbox_width / 2 + 5,
                  mailbox_length + 10,
                  straight_wall_h + roof_radius + 10]);
    }
}

if (render_part == "debug_clearances") assembled(true);

if (render_part == "debug_floor_collision") {
    intersection() {
        housing();
        floor_component_keepouts();
    }
}

if (render_part == "debug_flag_sweep") {
    color([0.9, 0.9, 0.9, 0.35]) housing();
    for (aa = [0, -45, -90])
        color([0.15, 0.75, 0.25, aa == 0 ? 0.9 : 0.25])
            place_flag(aa);
    color([0.9, 0.2, 0.2, 0.2])
        translate([mailbox_width + flag_wall_gap,
                   servo_pivot_y, servo_pivot_z])
            rotate([0, 90, 0])
                cylinder(h = flag_t, r = flag_arm_length + flag_plate_x);
}

if (render_part == "coupon_tft") tft_coupon();
if (render_part == "coupon_snap_housing") snap_housing_coupon();
if (render_part == "coupon_snap_floor") snap_floor_coupon();
if (render_part == "coupon_flag_horn") horn_coupon();
