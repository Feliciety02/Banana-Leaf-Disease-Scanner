# DahonMD Web

React/Vite role-based client with an action-oriented farmer experience and a separate administrator oversight dashboard. It communicates only with `../backend` through `VITE_WEB_API_URL` and uses a clearly marked simulated classifier until the trained artifact is available.

```powershell
Copy-Item .env.example .env
npm install
npm run dev -- --host 127.0.0.1 --port 4173
```

Production check: `npm run build`.

## Image Upload Contract

The field workflow should use JPG/JPEG, PNG, or WEBP images no larger than the backend's 10 MB request limit. The browser file extension is not a model feature. A future inference service must validate the actual decoded image, normalize orientation, convert to RGB, resize to `224 x 224`, scale pixels to `[0, 1]`, and use the exact deployed label map.

PNG uploads are compatible with a model trained from WEBP images, but compatible decoding does not prove equal accuracy. Compression, browser/device processing, lighting, blur, framing, background, and camera source may shift the pixel distribution. Deployment evaluation should include genuine web uploads and farmer phone captures rather than converted copies of training files.

The current classifier response remains simulated. The UI must continue displaying simulation and uncertainty flags until the validated inference service, trained model, and matching `label_map.json` are connected. Client-side previews and MIME filters are usability features, not substitutes for backend content validation.
