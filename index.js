const Broadcast = require('./Broadcast');
const Controller = require('./Controller');
const ComputerIPAddress = '192.168.100.19';

let b = new Broadcast(ComputerIPAddress);
let c = new Controller(ComputerIPAddress);

b.on('broadcast.device', (data, info) => {
    c.addDevice(data);
});

let startHue = 0;

setTimeout(() => {
    setInterval(()=> {
        // let colorList = getColorList(4);
        c.sendColors(generateRainbowColors());
    }, 100);
}, 5000);

let getColorList = function(count)
{
    let colors = [];
    for (let i = 0; i < count; i++)
    {
        let r = (lastR + i + 255) % 255;
        lastR = r;

        let g = (lastG + 2*i + 255) % 255;
        lastG = g;

        let b = (lastB + 3*i + 255) % 255;
        lastB = b;

        let generatedColor = [ r,g,b ];
        colors.push(generatedColor);
    }
    return colors;
}

function hslToRgb(h, s, l) {
    s /= 100;
    l /= 100;
  
    let c = (1 - Math.abs(2 * l - 1)) * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
  
    if (h >= 0 && h < 60) {
      r = c; g = x; b = 0;
    } else if (h >= 60 && h < 120) {
      r = x; g = c; b = 0;
    } else if (h >= 120 && h < 180) {
      r = 0; g = c; b = x;
    } else if (h >= 180 && h < 240) {
      r = 0; g = x; b = c;
    } else if (h >= 240 && h < 300) {
      r = x; g = 0; b = c;
    } else if (h >= 300 && h < 360) {
      r = c; g = 0; b = x;
    }
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
  
    return [r, g, b];
  }

function generateRainbowColors() {
    const colors = [];
    const hueStep = 15; // Increment hue by 30 degrees for each color to ensure variation
    const saturation = 100; // Set saturation to 100% for vibrant colors
    const lightness = 50; // Set lightness to 50% for balanced brightness
  
    // Generate 4 colors, each a step further in the hue spectrum
    for (let i = 0; i < 4; i++) {
        const hue = (startHue + hueStep * i) % 360; // Calculate hue, ensuring it wraps around at 360
        colors.push(hslToRgb(hue, saturation, lightness)); // Convert HSL to RGB
    }
  
    startHue = (startHue + 10) % 360; // Increment start hue for the next call, adjust for a slower or faster transition
  
    return colors;
  }

  