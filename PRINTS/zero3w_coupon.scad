// 15-minute first print for the Ender 3 V3 SE.
// Open tray: drop the real ZERO 3W in and try the three cables.
// If the plugs line up, print the Hive case. If they don't, stop and
// change port_clear / centers in zero3w_board.scad.

include <zero3w_board.scad>

xy_clear   = 0.5;
port_clear = 0.7;
wall       = 2.2;
floor_t    = 1.6;
under      = 2.4;
tall       = under + pcb_t + 5.5;

$fn = 36;

ix = board_x + 2 * xy_clear;
iy = board_y + 2 * xy_clear;
ox = ix + 2 * wall;
oy = iy + 2 * wall;

function bx(x) = wall + xy_clear + x;
function by(y) = wall + xy_clear + y;

module rounded_cube(size, r) {
    x = size[0]; y = size[1]; z = size[2];
    rr = min(r, x / 2 - 0.05, y / 2 - 0.05);
    hull()
        for (px = [rr, x - rr], py = [rr, y - rr])
            translate([px, py, 0])
                cylinder(h = z, r = rr);
}

z_top = floor_t + under + pcb_t;

difference() {
    rounded_cube([ox, oy, tall], 4.0);
    translate([wall, wall, floor_t])
        rounded_cube([ix, iy, tall], 2.2);
    // open the GPIO side so you can lift the board out
    translate([wall + 2, oy - wall - 0.1, floor_t + 0.6])
        cube([ix - 4, wall + 1, tall]);
    // ports
    usb3_w = usb3_cut_w(port_clear);
    otg_w  = otg_cut_w(port_clear);
    hdmi_w = hdmi_cut_w(port_clear);
    translate([bx(hdmi_cx) - hdmi_w / 2, -0.2, z_top - 1.0])
        cube([hdmi_w, wall + 2, hdmi_above + 1.0]);
    translate([bx(usb3_cx) - usb3_w / 2, -0.2, z_top - 1.0])
        cube([usb3_w, wall + 2, usb_above + 1.0]);
    translate([bx(otg_cx) - otg_w / 2, -0.2, z_top - 1.0])
        cube([otg_w, wall + 2, usb_above + 1.0]);
    // hole dimples so you can see if the board sits on the DXF holes
    for (p = hole_xy)
        translate([bx(p[0]), by(p[1]), -0.1])
            cylinder(h = 0.7, d = 2.4);
}

// tiny posts to rest the PCB on
for (p = hole_xy)
    translate([bx(p[0]), by(p[1]), floor_t])
        cylinder(h = under, d = 5.2);
