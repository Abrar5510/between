# Between — all four household servers in one image.
#
# The demo runs every family on one machine: the judge-facing page is served on
# 4001–4004, and the peer-to-peer negotiation traffic stays on 127.0.0.1
# between those ports, so a single tunnel (or a single exposed host) is enough.
FROM node:24-slim

WORKDIR /app

# Dependency layer first, so code edits do not reinstall the world.
COPY package.json package-lock.json ./
COPY packages/protocol/package.json packages/protocol/
RUN npm ci

# The project itself, then the two browser builds (app view + simulator page).
COPY . .
RUN npm run build

# The seeded morning: Thursday is always the same Thursday for judges, every
# restart is a clean rehearsal, and the agent replies are slowed enough to
# watch. Override any of these per container.
ENV NODE_ENV=production \
    DEMO_NOW=2026-10-17T09:00:00-07:00 \
    PACE_MS=1200

EXPOSE 4001 4002 4003 4004

# scripts/dev.ts generates the shared keys on first boot, wipes the four demo
# databases, and starts ahmad (4001), park (4002), lee (4003), chen (4004).
CMD ["node", "--import", "tsx", "scripts/dev.ts"]
