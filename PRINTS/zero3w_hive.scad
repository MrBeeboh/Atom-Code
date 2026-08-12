// Hive — original OpenSCAD enclosure for a Radxa ZERO 3W
//
// This is the designed-in-code case: a generated hex lattice lid,
// cantilever snap barbs (no screws required), visor hoods over the
// cable ports, and an optional 12° desk cradle.
//
// Board coordinates still come from Radxa's v1.11 DXF (see zero3w_board.scad).
// The *shape* is not a rounded box with holes punched in it.
//
// part = preview | base | lid | cradle | print

include <zero3w_board.scad>

/* [Export] */
part = "print"; // [preview, base, lid, cradle, print]

/* [Fit] */
xy_clear   = 0.45;
port_clear = 0.7;
under_clear = 3.2;
gpio_h     = 8.8;

/* [Hive] */
wall    = 2.4;
floor_t = 2.2;
lid_t   = 2.2;
outer_r = 5.2;
hex_pitch = 6.4;
hex_bar   = 1.25;
frame     = 7.2;

/* [Snaps] */
hook_len  = 5.2;
hook_w    = 7.2;
hook_t    = 1.35;
catch     = 0.95;
hook_gap  = 0.35;

/* [Cradle] */
cradle_deg = 12;

$fn = 40;

ix = board_x + 2 * xy_clear;
iy = board_y + 2 * xy_clear;
ox = ix + 2 * wall;
oy = iy + 2 * wall;
z_pcb_bot = floor_t + under_clear;
z_pcb_top = z_pcb_bot + pcb_t;
base_h    = z_pcb_top + gpio_h;
inner_r   = max(1.0, outer_r - wall);

function bx(x) = wall + xy_clear + x;
function by(y) = wall + xy_clear + y;

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
module rounded_cube(size, r) {
    x = size[0]; y = size[1]; z = size[2];
    rr = min(r, x / 2 - 0.05, y / 2 - 0.05);
    hull()
        for (px = [rr, x - rr], py = [rr, y - rr])
            translate([px, py, 0])
                cylinder(h = z, r = rr);
}

module rounded_rect(x, y, r) {
    rr = min(r, x / 2 - 0.05, y / 2 - 0.05);
    hull()
        for (px = [rr, x - rr], py = [rr, y - rr])
            translate([px, py])
                circle(r = rr);
}

module hexagon(r) {
    rotate([0, 0, 30])
        circle(r = r, $fn = 6);
}

// Axial hex grid. Flat-top cells, generated — not a imported mesh.
module hex_grid(sx, sy, pitch, bar) {
    r  = pitch / 2;
    dx = r * 1.5;
    dy = r * sqrt(3);
    hole_r = r - bar / 2;
    nx = ceil(sx / dx) + 2;
    ny = ceil(sy / dy) + 2;
    for (i = [0 : nx], j = [0 : ny]) {
        x = i * dx - r;
        y = j * dy + (i % 2) * dy / 2 - r;
        if (x > -pitch && x < sx + pitch && y > -pitch && y < sy + pitch)
            translate([x, y])
                hexagon(hole_r);
    }
}

module wall_slot(axis, along, z0, z1, width) {
    extra = 0.25;
    h = z1 - z0;
    if (axis == "y0")
        translate([bx(along) - width / 2, -extra, z0])
            cube([width, wall + xy_clear + extra + 1.4, h]);
    else if (axis == "x0")
        translate([-extra, by(along) - width / 2, z0])
            cube([wall + xy_clear + extra + 1.4, width, h]);
    else if (axis == "x1")
        translate([ox - wall - xy_clear - 1.4, by(along) - width / 2, z0])
            cube([wall + xy_clear + extra + 1.4, width, h]);
}

// ---------------------------------------------------------------------------
// Port visors — hull() "eyebrows" so the openings read as designed, not cut
// ---------------------------------------------------------------------------
module visor(cx, w, z1) {
    vw = w + 2.4;
    translate([bx(cx) - vw / 2, 0, z1 - 0.15])
        hull() {
            translate([0, 0.15, 0])
                cube([vw, 0.8, 0.35]);
            translate([0.6, -1.7, 1.9])
                cube([vw - 1.2, 0.8, 0.35]);
        }
}

module port_cutouts() {
    usb3_w = usb3_cut_w(port_clear);
    otg_w  = otg_cut_w(port_clear);
    hdmi_w = hdmi_cut_w(port_clear);
    usb_z0 = z_pcb_top - 1.0;
    usb_z1 = z_pcb_top + usb_above;
    hdmi_z0 = z_pcb_top - 1.0;
    hdmi_z1 = z_pcb_top + hdmi_above;
    wall_slot("y0", hdmi_cx, hdmi_z0, hdmi_z1, hdmi_w);
    wall_slot("y0", usb3_cx, usb_z0,  usb_z1,  usb3_w);
    wall_slot("y0", otg_cx,  usb_z0,  usb_z1,  otg_w);
}

module visors() {
    visor(hdmi_cx, hdmi_cut_w(port_clear), z_pcb_top + hdmi_above);
    visor(usb3_cx, usb3_cut_w(port_clear), z_pcb_top + usb_above);
    visor(otg_cx,  otg_cut_w(port_clear),  z_pcb_top + usb_above);
}

module gpio_cutout(z0, h) {
    mx = 0.8; my = 0.55;
    translate([bx(gpio_x0) - mx, by(gpio_y0) - my, z0])
        cube([(gpio_x1 - gpio_x0) + 2 * mx,
              oy - (by(gpio_y0) - my) + 0.25,
              h]);
}

// Snap windows: two per long side, through the wall, so the barb is visible.
function hook_xs() = [ox * 0.28, ox * 0.72];

module snap_windows() {
    wz = 2.5;
    zc = base_h - 3.3;
    for (x = hook_xs())
        translate([x - (hook_w + 0.7) / 2, -0.2, zc - wz / 2])
            cube([hook_w + 0.7, wall + 0.5, wz]);
}

module standoffs() {
    for (p = hole_xy)
        translate([bx(p[0]), by(p[1]), floor_t])
            difference() {
                cylinder(h = under_clear, d = 6.4);
                translate([0, 0, -0.1])
                    cylinder(h = under_clear + 0.2, d = 2.1);
            }
}

module floor_hex_vents() {
    translate([0, 0, -0.1])
        linear_extrude(floor_t + 0.2)
            intersection() {
                translate([bx(12), by(7)])
                    square([22, 14]);
                translate([bx(12), by(7)])
                    hex_grid(22, 14, hex_pitch, hex_bar);
            }
}

// ---------------------------------------------------------------------------
// Base
// ---------------------------------------------------------------------------
module base() {
    difference() {
        union() {
            difference() {
                rounded_cube([ox, oy, base_h], outer_r);
                translate([wall, wall, floor_t])
                    rounded_cube([ix, iy, base_h + 1], inner_r);
            }
            standoffs();
            visors();
        }
        port_cutouts();
        wall_slot("x1", sd_cy, z_pcb_bot - 2.5, z_pcb_bot + 0.6, sd_len + 2 * port_clear);
        wall_slot("x0", csi_cy, z_pcb_top - 0.4, z_pcb_top + 3.2, csi_len + 2 * port_clear);
        translate([bx(maskrom_xy[0]), by(maskrom_xy[1]), -0.2])
            cylinder(h = floor_t + 0.4, d = 4.2);
        gpio_cutout(z_pcb_top + 1.0, gpio_h + 1);
        snap_windows();
        floor_hex_vents();
        for (p = hole_xy)
            translate([bx(p[0]), by(p[1]), -0.2])
                cylinder(h = floor_t + under_clear + 0.4, d = 2.1);
    }
}

// ---------------------------------------------------------------------------
// Lid — hex lattice + snap barbs + recessed label
// ---------------------------------------------------------------------------
module snap_barb(outward = 1) {
    // Sits in lid space: z=0 is hook tip (prints on the bed).
    // Catch points toward +Y if outward=+1 (front wall), -Y if -1 (back).
    difference() {
        union() {
            cube([hook_w, hook_t, hook_len + 0.2]);
            // triangular catch
            translate([0, outward > 0 ? hook_t : -catch, hook_len - 3.5])
                hull() {
                    translate([0, outward > 0 ? 0 : catch, 0])
                        cube([hook_w, 0.05, 1.8]);
                    translate([0, outward > 0 ? catch : 0, 0.45])
                        cube([hook_w, 0.05, 0.7]);
                }
        }
        // flex slot so the beam can bend
        translate([hook_w / 2 - 0.35, outward > 0 ? -0.1 : -0.1, 0.6])
            cube([0.7, hook_t + catch + 0.2, hook_len - 2.4]);
    }
}

module lid_label() {
    // Solid front frame, not over the lattice, so the letters survive F6.
    translate([ox / 2, 3.7, hook_len + lid_t - 0.5])
        linear_extrude(0.6)
            text("ZERO 3W", size = 3.8, font = "Liberation Sans:style=Bold",
                 halign = "center", valign = "center", spacing = 1.08);
}

module lid() {
    difference() {
        union() {
            translate([0, 0, hook_len])
                rounded_cube([ox, oy, lid_t], outer_r);
            // snap barbs — port-side wall only.
            // The GPIO edge is an open slot, so clips there would hang in
            // the header cutout and not catch anything.
            for (x = hook_xs())
                translate([x - hook_w / 2, wall - hook_t - hook_gap, 0])
                    snap_barb(1);
        }
        // hex lattice through the lid plate, clipped to an inner window
        translate([0, 0, hook_len - 0.1])
            linear_extrude(lid_t + 0.3)
                intersection() {
                    translate([frame, frame])
                        rounded_rect(ox - 2 * frame, oy - 2 * frame - 3.5, 2.2);
                    hex_grid(ox, oy, hex_pitch, hex_bar);
                }
        gpio_cutout(hook_len - 0.2, lid_t + 0.5);
        lid_label();
        // M2.5 through-holes + 90° countersink on the outer face
        for (p = hole_xy) {
            translate([bx(p[0]), by(p[1]), hook_len - 0.2])
                cylinder(h = lid_t + 0.4, d = 2.9, $fn = 32);
            // 90° CSK for M2.5 flat-head: depth = (5.2 - 2.9) / 2
            translate([bx(p[0]), by(p[1]), hook_len + lid_t - 1.15])
                cylinder(h = 1.25, d1 = 2.9, d2 = 5.2, $fn = 64);
        }
    }
}

// ---------------------------------------------------------------------------
// 12° desk cradle — the case drops in; prints as a ramp, no supports
// ---------------------------------------------------------------------------
module cradle() {
    pad = 3.2;
    cx = ox + 2 * pad;
    cy = oy + 2 * pad;
    toe = 3.6;
    rise = tan(cradle_deg) * cy;
    difference() {
        hull() {
            cube([cx, 0.2, toe]);
            translate([0, cy - 0.2, 0])
                cube([cx, 0.2, toe + rise]);
        }
        translate([pad - 0.2, pad - 0.2, toe - 0.15])
            rotate([cradle_deg, 0, 0])
                rounded_cube([ox + 0.4, oy + 0.4, 50], outer_r + 0.15);
        translate([pad + bx(hdmi_cx) - 9, -0.2, toe - 0.5])
            cube([bx(otg_cx) - bx(hdmi_cx) + 18, pad + 8, 24]);
    }
}

module dummy_board() {
    color("green", 0.5)
        translate([bx(0), by(0), z_pcb_bot])
            rounded_cube([board_x, board_y, pcb_t], 3.0);
    color("silver", 0.85) {
        translate([bx(hdmi_cx) - 3.4, by(0) - 0.9, z_pcb_top]) cube([6.8, 7.5, 3.0]);
        translate([bx(usb3_cx) - 4.6, by(0) - 1.1, z_pcb_top]) cube([9.2, 7.5, 3.2]);
        translate([bx(otg_cx)  - 4.6, by(0) - 1.1, z_pcb_top]) cube([9.2, 7.5, 3.2]);
        translate([bx(gpio_x0), by(gpio_y0), z_pcb_top])
            cube([gpio_x1 - gpio_x0, gpio_y1 - gpio_y0, 8.5]);
    }
}

module print_plate() {
    base();
    translate([ox + 10, 0, 0])
        lid();
    translate([0, oy + 12, 0])
        cradle();
}

if (part == "base") base();
else if (part == "lid") lid();
else if (part == "cradle") cradle();
else if (part == "print") print_plate();
else {
    base();
    translate([0, 0, base_h - hook_len])
        lid();
    dummy_board();
}
