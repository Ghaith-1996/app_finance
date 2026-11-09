FROM node:22-bookworm@sha256:363e1587494626837fa7f9a23bdb453d13b0ff3c67c705c2805cfc69c2d2fad7
WORKDIR /work
ENV NEXT_TELEMETRY_DISABLED=1 PYTHONDONTWRITEBYTECODE=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npx playwright install --with-deps chromium
COPY requirements.lock ./
# --no-deps: the lock is a full pip-compile closure; Debian's pip 23.0 re-resolves stripped extras to unpinned versions.
RUN python3 -m venv /opt/python && /opt/python/bin/pip install --no-deps --require-hashes -r requirements.lock
ENV PATH="/opt/python/bin:${PATH}"
COPY . .
CMD ["node", "tests/e2e/run.mjs", "--inside"]
