# Latest Node.js based on Debian Buster slim version 
FROM node:buster-slim

# Non-root user provided by node image
ARG USERNAME=node

# Avoid warnings by switching to noninteractive
ENV DEBIAN_FRONTEND=noninteractive

RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | APT_KEY_DONT_WARN_ON_DANGEROUS_USAGE=1 apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    #
    # Chrome for puppeteer
    && apt-get install -y --no-install-recommends google-chrome-unstable \
    #
    # [Optional] Sudo support for non-root user
    && apt-get install -y sudo \
    && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME \
    #
    # Clean up
    && apt-get autoremove -y \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/* \
    #
    # Update npm
    && npm i npm@latest -g

# Switch back to dialog for any ad-hoc use of apt-get
ENV DEBIAN_FRONTEND=

# Install dependencies first, in a different location for easier app bind mounting for local development
# due to default /opt permissions we have to create the dir with root and change perms
RUN mkdir /opt/app && chown $USERNAME:$USERNAME /opt/app
WORKDIR /opt/app

# The official node image provides an unprivileged user as a security best practice
# but we have to manually enable it. We put it here so npm installs dependencies as the same
# user who runs the app. 
USER $USERNAME
COPY package.json package-lock.json* ./
RUN npm i
ENV PATH /opt/app/node_modules/.bin:$PATH

# Copy in our source code last, as it changes the most
COPY . .

RUN npm run build

CMD ["node", "dist/lakrimoca-v2.js"]
