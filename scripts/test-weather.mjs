// Run with: npm run test:weather   (compiles lib/weather.ts with tsc, then runs these checks)
import assert from "node:assert/strict";
import { describeCode, isWetCode, parseForecast } from "../.test-build/weather.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    process.exitCode = 1;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  }
}

// A real Open-Meteo answer (11 Oct 2026, London), trimmed to what we read.
const REAL = {
  current: { time: "2026-10-11T22:45", interval: 900, temperature_2m: 14.5, precipitation: 0.0, weather_code: 3 },
  hourly: { time: ["2026-10-11T22:00", "2026-10-11T23:00", "2026-10-12T00:00", "2026-10-12T01:00"], precipitation_probability: [0, 0, 0, 0] },
};
const answer = (current = {}, probabilities = [0, 0, 0, 0]) => ({
  current: { ...REAL.current, ...current },
  hourly: { precipitation_probability: probabilities },
});

console.log("reading the forecast");
test("a dry, cloudy evening", () => {
  assert.deepEqual(parseForecast(REAL), {
    tempC: 15, code: 3, label: "Cloudy", emoji: "☁️", raining: false, rainSoon: false, wet: false,
  });
});
test("rain now (by weather code)", () => {
  const w = parseForecast(answer({ weather_code: 61, temperature_2m: 9.2 }));
  assert.equal(w.raining, true);
  assert.equal(w.wet, true);
  assert.equal(w.label, "Rain");
  assert.equal(w.tempC, 9);
});
test("rain now (by measured precipitation, even if the code says cloudy)", () => {
  assert.equal(parseForecast(answer({ precipitation: 0.3 })).raining, true);
  assert.equal(parseForecast(answer({ precipitation: 0.05 })).raining, false); // a trace is not rain
});
test("rain soon: 50 percent or more within the next few hours", () => {
  const soon = parseForecast(answer({}, [0, 10, 60, 20]));
  assert.equal(soon.raining, false);
  assert.equal(soon.rainSoon, true);
  assert.equal(soon.wet, true);
  assert.equal(soon.label, "Rain likely soon");
  assert.equal(parseForecast(answer({}, [0, 49, 30, 10])).rainSoon, false);
  assert.equal(parseForecast(answer({}, [0, 0, 0, 0, 90])).rainSoon, false); // too far ahead to matter
});
test("when it is already raining, 'soon' does not also apply", () => {
  const w = parseForecast(answer({ weather_code: 63 }, [90, 90, 90, 90]));
  assert.equal(w.raining, true);
  assert.equal(w.rainSoon, false);
  assert.equal(w.label, "Rain");
});
test("negative temperatures and a missing hourly list", () => {
  assert.equal(parseForecast(answer({ temperature_2m: -3.6 })).tempC, -4);
  const noHourly = { current: REAL.current };
  assert.equal(parseForecast(noHourly).rainSoon, false);
});
test("anything unrecognisable gives null, never a guess", () => {
  for (const bad of [null, undefined, 42, "rain", [], {}, { current: {} }, { current: { temperature_2m: "warm", weather_code: 3 } }, { current: { temperature_2m: 10 } },
    { current: { temperature_2m: Number.NaN, weather_code: 3 } }]) {
    assert.equal(parseForecast(bad), null, JSON.stringify(bad));
  }
});

console.log("weather codes");
test("which weather counts as wet", () => {
  for (const code of [51, 55, 57, 61, 65, 67, 71, 75, 77, 80, 82, 85, 86, 95, 96, 99]) assert.equal(isWetCode(code), true, String(code));
  for (const code of [0, 1, 2, 3, 45, 48]) assert.equal(isWetCode(code), false, String(code));
});
test("descriptions", () => {
  assert.deepEqual(describeCode(0), { label: "Clear", emoji: "☀️" });
  assert.equal(describeCode(45).label, "Fog");
  assert.equal(describeCode(53).label, "Drizzle");
  assert.equal(describeCode(73).label, "Snow");
  assert.equal(describeCode(81).label, "Showers");
  assert.equal(describeCode(95).label, "Thunderstorm");
  assert.equal(describeCode(1234).label, "Unsettled");
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
