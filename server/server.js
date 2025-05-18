const fs = require('fs');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

const path = require('path');
const DATA_FILE = path.join(__dirname, 'data.json');

const timers = {
    motionDynamicOnTimeout: null,
    motionDynamicOffTimeout: null,
};

function getDefaultData() {
    return {
        lights: {
            1: { state: false, timerStart: null, history: [] },
            2: { state: false, timerStart: null, history: [] },
            3: { state: false, timerStart: null, history: [] },
            4: { state: false, timerStart: null, history: [] },
            5: { state: false, timerStart: null, history: [] },
            6: { state: false, timerStart: null, history: [] },
        },
        motionSensorStatic: { state: false, history: [] }, // всегда false, но с историей
        gasSensor: { state: false, history: [] },          // всегда false, с историей
        motionSensorDynamic: { state: false, history: [] }, // меняется с false на true на 1-5 сек
        temperature: { current: 22.0, history: [] },        // 18-26, шаг не больше 0.1
        humidity: { current: 50.0, history: [] },           // 30-80, шаг не больше 3
    };
}

function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(DATA_FILE));
        } catch {
            return getDefaultData();
        }
    } else {
        return getDefaultData();
    }
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function recordSensorHistory(sensor, state) {
    const now = Date.now();
    if (sensor.history.length === 0 || sensor.history[sensor.history.length - 1].state !== state) {
        sensor.history.push({ timestamp: now, state });
    }
}

function updateSensors() {
    const data = loadData();

    // Обновляем светильники
    for (let i = 1; i <= 6; i++) {
        const light = data.lights[i];
        const newState = Math.random() > 0.5;

        if (light.state !== newState) {
            if (newState) {
                // Включаем свет — запускаем таймер
                light.timerStart = Date.now();
            } else {
                // Выключаем свет — сохраняем время включения в историю
                if (light.timerStart !== null) {
                    const duration = Date.now() - light.timerStart;
                    light.history.push(duration);
                    light.timerStart = null;
                }
            }
            light.state = newState;
            // Для каждого переключения пишем в историю состояния (по желанию)
            recordSensorHistory(light, newState);
        }
    }

    // Статичные датчики движения и газа (всегда false)
    if (data.motionSensorStatic.state !== false) {
        data.motionSensorStatic.state = false;
        recordSensorHistory(data.motionSensorStatic, false);
    }
    if (data.gasSensor.state !== false) {
        data.gasSensor.state = false;
        recordSensorHistory(data.gasSensor, false);
    }

    // Динамический датчик движения с таймерами
    if (!timers.motionDynamicOnTimeout && !timers.motionDynamicOffTimeout) {
        const interval = (3 * 60 * 1000) + Math.random() * (2 * 60 * 1000);
        timers.motionDynamicOnTimeout = setTimeout(() => {
            data.motionSensorDynamic.state = true;
            recordSensorHistory(data.motionSensorDynamic, true);
            saveData(data);

            const activeDuration = 1000 + Math.random() * 4000;
            timers.motionDynamicOffTimeout = setTimeout(() => {
                data.motionSensorDynamic.state = false;
                recordSensorHistory(data.motionSensorDynamic, false);
                saveData(data);

                timers.motionDynamicOnTimeout = null;
                timers.motionDynamicOffTimeout = null;
            }, activeDuration);
        }, interval);
    }

    // Температура с изменением не более ±0.1
    let tempChange = (Math.random() * 0.2) - 0.1;
    let newTemp = +(data.temperature.current + tempChange).toFixed(1);
    if (newTemp < 18) newTemp = 18.0;
    if (newTemp > 26) newTemp = 26.0;
    if (newTemp !== data.temperature.current) {
        data.temperature.current = newTemp;
        data.temperature.history.push({ timestamp: Date.now(), value: newTemp });
    }

    // Влажность с изменением не более ±3
    let humidityChange = (Math.random() * 6) - 3;
    let newHumidity = +(data.humidity.current + humidityChange).toFixed(1);
    if (newHumidity < 30) newHumidity = 30.0;
    if (newHumidity > 80) newHumidity = 80.0;
    if (newHumidity !== data.humidity.current) {
        data.humidity.current = newHumidity;
        data.humidity.history.push({ timestamp: Date.now(), value: newHumidity });
    }

    saveData(data);
    return data;
}

// Инициализация
updateSensors();

// Обновление каждые 3 минуты
setInterval(updateSensors, 3 * 60 * 1000);

app.use(express.json());

// REST API

// Текущие данные всех сенсоров
app.get('/current', (req, res) => {
    const data = loadData();

    // Подготовим удобный объект с текущими состояниями (без истории)
    const currentData = {
        lights: {},
        motionSensorStatic: data.motionSensorStatic.state,
        gasSensor: data.gasSensor.state,
        motionSensorDynamic: data.motionSensorDynamic.state,
        temperature: data.temperature.current,
        humidity: data.humidity.current,
    };

    for (let i = 1; i <= 6; i++) {
        currentData.lights[i] = data.lights[i].state;
    }

    res.json(currentData);
});

// Полная история по всем сенсорам
app.get('/history', (req, res) => {
    const data = loadData();

    const historyData = {
        lights: {},
        motionSensorStatic: data.motionSensorStatic.history,
        gasSensor: data.gasSensor.history,
        motionSensorDynamic: data.motionSensorDynamic.history,
        temperature: data.temperature.history,
        humidity: data.humidity.history,
    };

    for (let i = 1; i <= 6; i++) {
        historyData.lights[i] = data.lights[i].history;
    }

    res.json(historyData);
});

// Принудительно обновить данные
app.post('/generate', (req, res) => {
    const newData = updateSensors();
    res.json(newData);
});

app.get('/', (req, res) => {
    res.send('Сервер работает. Маршруты: /current (текущие данные), /history (история), /generate (обновить)');
});

app.listen(PORT, () => {
    console.log(`Сервер запущен на ${PORT}`);
});


/*http://localhost:3000/history

http://localhost:3000/current

метод пост быстрое обновление Postman http://localhost:3000/generate*/