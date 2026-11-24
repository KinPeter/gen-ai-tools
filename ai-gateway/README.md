AI machine side API server application will live here.

## Run

```sh
npm run ai-gateway   # node ai-gateway/index.mjs
AIGW_PORT=5000 npm run ai-gateway
```

The server binds to `0.0.0.0` and logs the LAN URL at startup (the gateway runs
on the home AI server; other computers reach it over the LAN). No database, no
Vite build, no auth yet.

## Served

| Path        | What it serves                                |
| ----------- | --------------------------------------------- |
| `/`         | Temporary status page (port, LAN URL, mounts) |
| `/assets/*` | `ai-gateway/assets/` (favicons, manifest)     |

### API routes

Two image-upload mounts, built from the same shared code (`api/shared/`):

| Route                     | Env var                        | Folder                            |
| ------------------------- | ------------------------------ | --------------------------------- |
| `/api/my-image-uploads/*` | `AIGW_MY_IMAGE_UPLOADS_FOLDER` | the caller's own comfyui `input/` |
| `/api/cy-image-uploads/*` | `AIGW_CY_IMAGE_UPLOADS_FOLDER` | Cheyun's comfyui `input/`         |

Each mount serves the same three endpoints:

- `GET <prefix>/list` — lists plain filenames in the configured folder (sorted alphabetically)
- `POST <prefix>/upload` — saves one uploaded file there (`multipart/form-data`, max 50 MB)
- `POST <prefix>/delete` — deletes files named in the JSON body (`{ "files": [...] }`)

Anything else answers 404.

TODOs:

- File upload: voice to mlx-audio, image to comfyui/stability matrix | ui + api
- Stability matrix / comfyui default output folder cleanup after each comfy batch
-
