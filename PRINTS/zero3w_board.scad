// Shared Radxa ZERO 3W mechanicals from official v1.11 DXF.
// Origin: HDMI/CSI corner. GPIO along y=30. Ports along y=0.

board_x = 65.0;
board_y = 30.0;
pcb_t   = 1.2;

hole_xy = [
    [ 3.55,  3.60],
    [ 3.60, 26.45],
    [61.40,  3.60],
    [61.40, 26.50]
];

hdmi_x0 =  9.18; hdmi_x1 = 15.68;
usb3_x0 = 36.93; usb3_x1 = 46.04;
otg_x0  = 49.51; otg_x1  = 58.50;

hdmi_cx = (hdmi_x0 + hdmi_x1) / 2;
usb3_cx = (usb3_x0 + usb3_x1) / 2;
otg_cx  = (otg_x0  + otg_x1)  / 2;

gpio_x0 = 7.05;  gpio_x1 = 57.85;
gpio_y0 = 24.14; gpio_y1 = 29.22;

csi_cy = 15.03; csi_len = 17.5;
sd_cy  = 15.00; sd_len  = 12.8;

maskrom_xy = [21.84, 2.20];
ufl_xy     = [63.50, 19.685];
