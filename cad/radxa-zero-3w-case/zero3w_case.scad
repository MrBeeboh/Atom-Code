// Radxa ZERO 3W enclosure — two-piece, FDM-friendly (Ender 3 V3 SE)
//
// Board geometry is taken from Radxa's official ZERO 3W v1.11 2D DXF
// (dl.radxa.com/zero3/docs/hw/3w/radxa_zero_3w_2d_dxf.zip), not from a
// Pi Zero clone assumption. Ports are NOT in Pi Zero locations.
//
// Usage (OpenSCAD Customizer, or command line -D part='"base"'):
//   part = "preview"  assembled view with a dummy board
//   part = "base"     bottom tray
//   part = "lid"      top cover
//   part = "print"    both parts laid flat for one-plate export

/* [Export] */
part = "print"; // [preview, base, lid, print]

/* [Board] */
// Official outline
board_x = 65.0;
board_y = 30.0;
pcb_t   = 1.2;

/* [Fit] */
// Extra space around the PCB in X/Y (FDM shrinkage / elephant foot)
xy_clear = 0.45;
// Extra inflation of every cable cutout (raise if plugs are tight)
port_clear = 0.7;
// Space under the PCB for microSD cage, MaskROM, eMMC
under_clear = 3.2;
// Space above the PCB. 8.8 fits a standard 8.5 mm 40-pin female header.
gpio_h = 8.8;

/* [Case] */
wall    = 2.0;
floor_t = 2.0;
lid_t   = 2.0;
// Inner alignment tongue on the lid
tongue_h     = 1.8;
tongue_clear = 0.30;
outer_r      = 4.0;

/* [Hardware] */
// false: 2.1 mm pilot for M2.5 thread-forming into plastic
// true:  3.6 mm bore for M2.5 heat-set inserts
heat_set_inserts = false;
screw_clear_d    = 2.9;   // lid through-hole for M2.5
insert_pilot_d   = 2.1;
insert_bore_d    = 3.6;
standoff_d       = 6.4;

/* [Features] */
gpio_slot     = true;
csi_slot      = true;
sd_slot       = true;
maskrom_hole  = true;
ufl_hole      = false;    // 4.5 mm hole over the u.FL for an external antenna
lid_vents     = true;
floor_vents   = true;

$fn = 48;

// ---------------------------------------------------------------------------
// Official v1.11 DXF coordinates (origin = board corner at HDMI/CSI end,
// GPIO along y = 30, ports along y = 0)
// ---------------------------------------------------------------------------
hole_xy = [
    [ 3.55,  3.60],
    [ 3.60, 26.45],
    [61.40,  3.60],
    [61.40, 26.50]
];

hdmi_cx   = (9.18 + 15.68) / 2;     // 12.43  silk overhang 6.50 mm
usb3_cx   = (36.93 + 46.04) / 2;    // 41.485 silk overhang 9.11 mm
usbotg_cx = (49.51 + 58.50) / 2;    // 54.005 silk overhang 8.99 mm

gpio_x0 = 7.05;   gpio_x1 = 57.85;
gpio_y0 = 24.14;  gpio_y1 = 29.22;

csi_cy = 15.03;   csi_len = 17.5;
sd_cy  = 15.00;   sd_len  = 12.8;

maskrom_xy = [21.84, 2.20];
ufl_xy     = [63.50, 19.685];

// Derived
ix = board_x + 2 * xy_clear;
iy = board_y + 2 * xy_clear;
ox = ix + 2 * wall;
oy = iy + 2 * wall;
z_pcb_bot = floor_t + under_clear;
z_pcb_top = z_pcb_bot + pcb_t;
base_h    = z_pcb_top + gpio_h;
lid_h     = lid_t + tongue_h;
inner_r   = max(0.8, outer_r - wall);

function bx(x) = wall + xy_clear + x;
function by(y) = wall + xy_clear + y;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
module rounded_cube(size, r) {
    x = size[0]; y = size[1]; z = size[2];
    rr = min(r, x / 2 - 0.01, y / 2 - 0.01);
    hull() {
        for (px = [rr, x - rr], py = [rr, y - rr])
            translate([px, py, 0])
                cylinder(h = z, r = rr);
    }
}

module wall_slot(axis, along, z0, z1, width) {
    // Cut a rectangular opening through a case wall.
    // axis: "x0" left, "x1" right, "y0" front (ports), "y1" back (GPIO)
    extra = 0.2;
    h = z1 - z0;
    if (axis == "y0")
        translate([bx(along) - width / 2, -extra, z0])
            cube([width, wall + xy_clear + extra + 1.2, h]);
    else if (axis == "y1")
        translate([bx(along) - width / 2, oy - wall - xy_clear - 1.2, z0])
            cube([width, wall + xy_clear + extra + 1.2, h]);
    else if (axis == "x0")
        translate([-extra, by(along) - width / 2, z0])
            cube([wall + xy_clear + extra + 1.2, width, h]);
    else if (axis == "x1")
        translate([ox - wall - xy_clear - 1.2, by(along) - width / 2, z0])
            cube([wall + xy_clear + extra + 1.2, width, h]);
}

module vent_grille(sx, sy, t, slot = 1.6, bar = 1.6) {
    pitch = slot + bar;
    n = floor((sy + bar) / pitch);
    used = n * pitch - bar;
    y0 = (sy - used) / 2;
    for (i = [0 : n - 1])
        translate([-0.1, y0 + i * pitch, -0.1])
            cube([sx + 0.2, slot, t + 0.2]);
}

// ---------------------------------------------------------------------------
// Cutouts (shared by base; GPIO/u.FL also used by lid)
// ---------------------------------------------------------------------------
module port_cutouts() {
    // Cutouts follow the metal shells, not the cable overmold. The two
    // USB-C shells are only 3.5 mm apart; inflating them for the overmold
    // merges the openings into one slot.
    usb3_w   = (46.04 - 36.93) + 2 * port_clear;
    usbotg_w = (58.50 - 49.51) + 2 * port_clear;
    hdmi_w   = (15.68 -  9.18) + 2 * port_clear;  // micro HDMI, not padded to USB-C
    usb_z0 = z_pcb_top - 1.0;
    usb_z1 = z_pcb_top + 6.6;
    hdmi_z0 = z_pcb_top - 0.5;
    hdmi_z1 = z_pcb_top + 4.2;

    wall_slot("y0", hdmi_cx,   hdmi_z0, hdmi_z1, hdmi_w);
    wall_slot("y0", usb3_cx,   usb_z0,  usb_z1,  usb3_w);
    wall_slot("y0", usbotg_cx, usb_z0,  usb_z1,  usbotg_w);
}

module sd_cutout() {
    if (sd_slot)
        wall_slot("x1", sd_cy, z_pcb_bot - 2.5, z_pcb_bot + 0.6, sd_len + 2 * port_clear);
}

module csi_cutout() {
    if (csi_slot)
        wall_slot("x0", csi_cy, z_pcb_top - 0.4, z_pcb_top + 3.2, csi_len + 2 * port_clear);
}

module maskrom_cutout() {
    if (maskrom_hole)
        translate([bx(maskrom_xy[0]), by(maskrom_xy[1]), -0.2])
            cylinder(h = floor_t + 0.4, d = 4.2);
}

module gpio_cutout(z0, h) {
    if (gpio_slot) {
        mx = 0.8;
        my = 0.6;
        translate([bx(gpio_x0) - mx, by(gpio_y0) - my, z0])
            cube([
                (gpio_x1 - gpio_x0) + 2 * mx,
                oy - (by(gpio_y0) - my) + 0.2,
                h
            ]);
    }
}

module ufl_cutout(z0, h) {
    if (ufl_hole)
        translate([bx(ufl_xy[0]), by(ufl_xy[1]), z0])
            cylinder(h = h, d = 4.5);
}

module floor_vent_cutouts() {
    if (floor_vents)
        translate([bx(14), by(8), -0.1])
            vent_grille(18, 12, floor_t + 0.2);
}

module lid_vent_cutouts() {
    if (lid_vents)
        translate([bx(16), by(6), lid_h - lid_t - 0.1])
            vent_grille(22, 14, lid_t + 0.3);
}

module screw_bores(z0, h, d) {
    for (p = hole_xy)
        translate([bx(p[0]), by(p[1]), z0])
            cylinder(h = h, d = d);
}

module countersinks() {
    // 90° M2.5 CSK, wide end on the outer lid face
    csk_h = (5.2 - screw_clear_d) / 2;
    for (p = hole_xy)
        translate([bx(p[0]), by(p[1]), lid_h - csk_h])
            cylinder(h = csk_h + 0.1, d1 = screw_clear_d, d2 = 5.2);
}

// ---------------------------------------------------------------------------
// Parts
// ---------------------------------------------------------------------------
module standoffs() {
    d = heat_set_inserts ? insert_bore_d : insert_pilot_d;
    for (p = hole_xy) {
        translate([bx(p[0]), by(p[1]), floor_t])
            difference() {
                cylinder(h = under_clear, d = standoff_d);
                translate([0, 0, -0.1])
                    cylinder(h = under_clear + 0.2, d = d);
            }
    }
}

module base() {
    difference() {
        union() {
            difference() {
                rounded_cube([ox, oy, base_h], outer_r);
                translate([wall, wall, floor_t])
                    rounded_cube([ix, iy, base_h + 1], inner_r);
            }
            standoffs();
        }
        port_cutouts();
        sd_cutout();
        csi_cutout();
        maskrom_cutout();
        floor_vent_cutouts();
        gpio_cutout(z_pcb_top + 1.0, gpio_h + 1);
        // Through-bores so an M2.5 can pass if you overshoot
        screw_bores(-0.2, floor_t + under_clear + 0.4,
                    heat_set_inserts ? insert_bore_d : insert_pilot_d);
    }
}

module lid() {
    tongue_wall = 1.3;
    tx = ix - 2 * tongue_clear;
    ty = iy - 2 * tongue_clear;
    to = wall + tongue_clear;

    difference() {
        union() {
            translate([0, 0, tongue_h])
                rounded_cube([ox, oy, lid_t], outer_r);
            translate([to, to, 0])
                difference() {
                    rounded_cube([tx, ty, tongue_h + 0.2], max(0.6, inner_r - tongue_clear));
                    translate([tongue_wall, tongue_wall, -0.2])
                        rounded_cube([
                            tx - 2 * tongue_wall,
                            ty - 2 * tongue_wall,
                            tongue_h + 0.6
                        ], max(0.4, inner_r - tongue_clear - tongue_wall));
                }
        }
        gpio_cutout(-0.2, lid_h + 0.4);
        ufl_cutout(-0.2, lid_h + 0.4);
        lid_vent_cutouts();
        screw_bores(-0.2, lid_h + 0.4, screw_clear_d);
        countersinks();
    }
}

module dummy_board() {
    color("green", 0.55)
        translate([bx(0), by(0), z_pcb_bot])
            rounded_cube([board_x, board_y, pcb_t], 3.0);
    color("silver", 0.8) {
        translate([bx(hdmi_cx) - 3.4, by(0) - 0.9, z_pcb_top])
            cube([6.8, 7.5, 3.0]);
        translate([bx(usb3_cx) - 4.6, by(0) - 1.1, z_pcb_top])
            cube([9.2, 7.5, 3.2]);
        translate([bx(usbotg_cx) - 4.6, by(0) - 1.1, z_pcb_top])
            cube([9.2, 7.5, 3.2]);
        translate([bx(gpio_x0), by(gpio_y0), z_pcb_top])
            cube([gpio_x1 - gpio_x0, gpio_y1 - gpio_y0, 8.5]);
    }
}

module print_plate() {
    base();
    translate([ox + 8, oy, lid_h])
        rotate([180, 0, 0])
            lid();
}

// ---------------------------------------------------------------------------
if (part == "base") base();
else if (part == "lid") lid();
else if (part == "print") print_plate();
else {
    base();
    translate([0, 0, base_h - tongue_h])
        lid();
    dummy_board();
}
