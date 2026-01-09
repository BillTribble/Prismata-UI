const fs = require('fs');

const inputFile = './public/prismata_attract_13.json';
const outputFile = './public/prismata_attract_13_smooth.json';

let events = JSON.parse(fs.readFileSync(inputFile));

let cameraEvents = events.filter(e => e.type === 'camera');
let otherEvents = events.filter(e => e.type !== 'camera');

let newEvents = [];

let step = 10; // ms

for (let i = 0; i < cameraEvents.length - 1; i++) {
  let start = cameraEvents[i];
  let end = cameraEvents[i + 1];
  let startTime = start.time;
  let endTime = end.time;
  let duration = endTime - startTime;
  let steps = Math.floor(duration / step);

  for (let s = 0; s <= steps; s++) {
    let t = startTime + s * step;
    if (t > endTime) t = endTime;
    let ratio = duration > 0 ? (t - startTime) / duration : 0;

    let pos = {
      x: start.value.pos.x + ratio * (end.value.pos.x - start.value.pos.x),
      y: start.value.pos.y + ratio * (end.value.pos.y - start.value.pos.y),
      z: start.value.pos.z + ratio * (end.value.pos.z - start.value.pos.z)
    };

    let target = {
      x: start.value.target.x + ratio * (end.value.target.x - start.value.target.x),
      y: start.value.target.y + ratio * (end.value.target.y - start.value.target.y),
      z: start.value.target.z + ratio * (end.value.target.z - start.value.target.z)
    };

    newEvents.push({
      time: t,
      type: 'camera',
      value: { pos, target }
    });
  }
}

// Add the last camera event if not included
if (cameraEvents.length > 0) {
  let last = cameraEvents[cameraEvents.length - 1];
  newEvents.push(last);
}

// Merge other events
newEvents = newEvents.concat(otherEvents);

// Sort by time
newEvents.sort((a, b) => a.time - b.time);

// Remove duplicates if any (same time)
newEvents = newEvents.filter((e, i, arr) => i === 0 || e.time !== arr[i-1].time || e.type !== 'camera');

fs.writeFileSync(outputFile, JSON.stringify(newEvents, null, 2));

console.log(`Smoothed recording saved to ${outputFile}. Original events: ${events.length}, new events: ${newEvents.length}`);