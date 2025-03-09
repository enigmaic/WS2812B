const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios')
const fs = require('fs');
const app = express();
const path = require('path');
const configFile = 'config.json';

const { spawn } = require('child_process');
let childProcess;

app.use(bodyParser.json());


app.use((req, res, next) => {
    if (req.headers['x-proxy-forwarded'] == 'true') {
        if (req.path == '/toggleLights' && req.method == 'POST') {
            next()
        } else {
            res.status(404).send('Not Found')
        }
    } else next()
})

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});




const ws281x = require('rpi-ws281x-native');

const NUM_LEDS = 255;
const channel = ws281x(NUM_LEDS, { stripType: 'ws2812' });

var colorArray = channel.array;

var presets = [];

app.post('/setColor', async (req, res) => {
    const { red, green, blue, isAuxLed, anim } = req.body;

    if (isAuxLed) {
        sendPOSTRequest("http://192.168.0.103/setFullColor", [`${red}-${green}-${blue}`])
    } else {

      renderLEDs([red, green, blue], null, anim);
        // const firstLoop = (async () => {
        //     for (let i = 0; i <= 118; i++) {
        //         colorArray[i] = (red << 16) | (green << 8) | blue;
        //         await wait(20);
        //         ws281x.render();
        //     }
        // })();
        //
        // const secondLoop = (async () => {
        //     for (let i = 255; i >= 119; i--) {
        //         colorArray[i] = (red << 16) | (green << 8) | blue;
        //         await wait(10);
        //         ws281x.render();
        //     }
        // })();
        //
        //
        // await Promise.all([firstLoop, secondLoop])
    }

    res.status(200).json({ message: 'Color set successfully' });
});


app.post('/addPreset', (req, res) => {
    const { name } = req.body;

    if (name && name.trim() !== '') {
        const preset = { name, colors: colorArray.slice() };
        presets.push(preset);

        savePresetsToFile();

        res.status(200).json({ message: 'Preset added successfully' });
    } else {
        res.status(400).json({ message: 'Invalid preset name' });
    }
});

var presetClicked = 0
app.post('/clearPreset', (req, res) => {
    if (presetClicked == 3) {
        presets = []
        savePresetsToFile()
        presetClicked = 0
    } else {
        presetClicked++
        setTimeout(() => {
            presetClicked = 0
        }, 2000);
    }
    res.status(200)
})

app.get('/presets', (req, res) => {
    res.json(presets);
});
var activeFlag = true;
var animations = {}
var effects = {}
var activeEffect = null;

renderLEDs(null, null)
renderLEDEffect(null);

app.get('/animations', (req, res) => {
  var animationNames = Object.keys(animations)
  const animationBlacklist = ["Fade"]
  animationNames = animationNames.filter(anim => !animationBlacklist.includes(anim))
  res.send(animationNames)
})

app.get("/effects", (req, res) => {

  var effectNames = Object.keys(effects)
  console.log(effectNames)
  res.send(effectNames)
})

app.get("/effect/:effect", async (req, res) => {
  let effect = req.params.effect
  if (effects[effect]) {
    animations["Fade"]();
    await wait(1000)
    renderLEDEffect(effect)
    res.sendStatus(200)
  }
})


async function renderLEDs(colors, preset, anim) {
  childProcess ? childProcess.kill() : null;
  let [red, green, blue] = (preset ? [0, 0, 0] : colors ? colors : [0, 0, 0])

  if (channel.brightness == 0) {
    for (var i = 0; i < NUM_LEDS; i++) {
      colorArray[i] = 0
    }
    channel.brightness = 255;
  }

  animations = {
    "StartEnd": async function() {
      const firstLoop = (async () => {
          for (let i = 0; i <= 118; i++) {
              colorArray[i] = preset ? preset[i] : (red << 16) | (green << 8) | blue;
              await wait(20);
              ws281x.render();
          }
      })();

      const secondLoop = (async () => {
          for (let i = 255; i >= 119; i--) {
              colorArray[i] = preset ? preset[i] : (red << 16) | (green << 8) | blue;
              await wait(10);
              ws281x.render();
          }
      })();


      await Promise.all([firstLoop, secondLoop])
    },

    "Start": async function() {
      for (let i = 0; i <= NUM_LEDS; i++) {
        colorArray[i] = preset ? preset[i] : (red << 16) | (green << 8) | blue;
        await wait(5);
        ws281x.render();
      }
    },

    "End": async function() {
      for (let i =  NUM_LEDS; i >= 0; i--) {
        colorArray[i] = preset ? preset[i] : (red << 16) | (green << 8) | blue;
        await wait(5)
        ws281x.render();
      }
    },

    "Middle": async function() {
      const firstLoop = (async () => {
          for (let i = 119; i <= NUM_LEDS; i++) {
              colorArray[i] = preset ? preset[i] : (red << 16) | (green << 8) | blue;
              await wait(20);
              ws281x.render();
          }
      })();

      const secondLoop = (async () => {
          for (let i = 118; i >= 0; i--) {
              colorArray[i] = preset ? preset[i] : (red << 16) | (green << 8) | blue;
              await wait(10);
              ws281x.render();
          }
      })();


      await Promise.all([firstLoop, secondLoop])
    },

    "Fade": async function() {
      for (var i = NUM_LEDS; i >= 0; i -= 5) {
        channel.brightness = i
        await wait(20);
        ws281x.render()
      }
    }

  }


  if (preset && preset.every(x => x == 0)) {
    animations["Fade"]();
  } else {
    if (colors || preset) {
      animations[anim]();
    }
  }

}


async function renderLEDEffect(effect) {
  if (channel.brightness == 0) {
    for (var i = 0; i < NUM_LEDS; i++) {
      colorArray[i] = 0;
    }
    channel.brightness = 255;
  }


  effects = {
    "Rainbow": true
  };

  if (effects[effect] && activeEffect != effect) {
    childProcess ? childProcess.kill() : null;
    activeEffect = effect;
    childProcess = spawn("sudo", ["node", "rainbow.js"])
  } else if (effects[effect] && activeEffect == effect) {
    childProcess.kill()
    activeEffect = null;
    await wait(70)
    animations["Fade"]();
  }
}



app.post('/addSegment', async (req, res) => {
    const { red, green, blue, startDiode, endDiode } = req.body;
    const startDiodeIdx = Number(startDiode) - 1;
    const endDiodeIdx = Number(endDiode) - 1;

    if (startDiodeIdx >= 0 && endDiodeIdx < NUM_LEDS) {
        for (let i = startDiodeIdx; i <= endDiodeIdx; i++) {
            colorArray[i] = (red << 16) | (green << 8) | blue;
            await wait(20)
            ws281x.render();
        }

        res.status(200).json({ message: 'Segment set successfully' });
    } else {
        res.status(400).json({ message: 'Invalid segment range' });
    }
});


app.post('/applyPreset', async (req, res) => {
    const { name, anim } = req.body;

    const selectedPreset = presets.find((preset) => preset.name === name);

    if (selectedPreset) {
        const newChannelArray = Object.values(selectedPreset.colors)
        if (newChannelArray.length === NUM_LEDS) {
            renderLEDs(null, newChannelArray, anim)
            res.status(200).json({ message: 'Preset applied successfully' });
        } else {
            res.status(400).json({ message: 'Invalid preset format: Length does not match NUM_LEDS' });
        }
    } else {
        res.status(400).json({ message: 'Preset not d' });
    }
});


app.post('/toggleLights', (req, res) => {
    const body = req.body;

    if (body.token == "48FJSNnc893SLFJ@41%s5#") {
        if (body.lightsOn) {
            var activePreset = findActivePreset()
            chosenPreset = activePreset == 'White' ? 'Red' : 'White'
            sendPOSTRequest('http://localhost:3000/applyPreset', { name: chosenPreset})
            res.status(200).send('Turned the lights on.')
        } else {
            sendPOSTRequest('http://localhost:3000/applyPreset', { name: 'Off'})
            res.status(200).send('Turned the lights off.')
        }
    } else res.status(404)

})


function savePresetsToFile() {
    fs.writeFile('presets.json', JSON.stringify(presets), (err) => {
        if (err) {
            console.error('Error saving presets to file:', err);
        }
    });
}

fs.readFile('presets.json', 'utf8', (err, data) => {
    if (!err) {
        try {
            presets.push(...JSON.parse(data));
        } catch (e) {
            console.error('Error loading presets from file:', e);
        }
    }
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});


function loadConfig() {
    try {
      const data = fs.readFileSync(configFile);
      return JSON.parse(data);
    } catch (err) {
      console.error('Error loading config file:', err);
      return {};
    }
  }


const config = loadConfig()

a_shutoff = config.autoShutOffHour;
automateShutdown(a_shutoff)

var timeOut = null

async function automateShutdown(hour) {
    const shutdownTime = new Date()
    var d_time = hour.split(':')
    shutdownTime.setHours(Number(d_time[0])-1, Number(d_time[1]), 0, 0)

    const currentTime = new Date()
    const v_shutdown = shutdownTime - currentTime

    if (timeOut) clearTimeout(timeOut)
    timeOut = setTimeout(async () => {


      sendPOSTRequest("http://192.168.0.103/setFullColor", [`0-0-0`])
      for (var i = NUM_LEDS; i >= 0; i -= 5) {
        channel.brightness = i
        await wait(20);
        ws281x.render()
      }


    }, v_shutdown);
}



// Save the configuration to the file
function saveConfig(config) {
  const configDataJSON = JSON.stringify(config, null, 2);

  fs.writeFile(configFile, configDataJSON, 'utf8', (err) => {
    if (err) {
      console.error('Error writing to the configuration file:', err);
    } else {
      console.log('Configuration file updated successfully.');
    }
  });
}

app.post('/saveTime', (req, res) => {
    const { time } = req.body;

    config.autoShutOffHour = time

    saveConfig(config)
    automateShutdown(time)
})

function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

function sendPOSTRequest (url, body) {
    axios.post(url, body)
    .then(response => {
       console.log(response.data);
       return 'sent'
    })
    .catch(error => {
      console.error(error);
      return 'Internal Server Error'
    });
}


function findActivePreset() {
    var a_preset = presets.find((_v) => JSON.stringify(Object.values(_v.colors)) == JSON.stringify(Array.from(colorArray)))
    return a_preset ? a_preset.name : false
}
