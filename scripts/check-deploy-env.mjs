// Check presence only. Never write browser keys or their contents to logs.
const key = process.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
const mapId = process.env.VITE_GOOGLE_MAP_ID?.trim();
const errors = [];
if (!key || key === 'YOUR_BROWSER_API_KEY') errors.push('Set the GOOGLE_MAPS_API_KEY repository Actions secret.');
if (!mapId || mapId.toUpperCase() === 'DEMO_MAP_ID') errors.push('Set the GOOGLE_MAP_ID repository Actions variable to your own JavaScript Map ID.');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log('Deployment map settings are present. Key validity and website restrictions must be checked in Google Cloud.');
}
