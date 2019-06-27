FROM node:slim

# Configure apt
ENV DEBIAN_FRONTEND=noninteractive

# Configure apt and install packages
RUN apt-get update \
  && apt-get -y install --no-install-recommends apt-utils 2>&1 \ 
  #
  # Verify git and needed tools are installed
  && apt-get install -y git procps \
  #
  && apt-get install -y curl apt-transport-https lsb-release \
  && curl -sS https://dl.yarnpkg.com/$(lsb_release -is | tr '[:upper:]' '[:lower:]')/pubkey.gpg | apt-key add - 2>/dev/null \
  && echo "deb https://dl.yarnpkg.com/$(lsb_release -is | tr '[:upper:]' '[:lower:]')/ stable main" | tee /etc/apt/sources.list.d/yarn.list \
  && apt-get update \
  #
  # Install latest chrome dev package and fonts to support major charsets
  && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
  && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
  && apt-get update \
  && apt-get install -y google-chrome-unstable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst ttf-freefont --no-install-recommends \
  #
  # Clean up
  && apt-get autoremove -y \
  && apt-get clean -y \
  && rm -rf /var/lib/apt/lists/*

# Switch back to dialog for any ad-hoc use of apt-get
ENV DEBIAN_FRONTEND=dialog

# Install node dependencies
COPY package*.json ./
RUN npm install --silent 

# Copy project files
COPY . .

# Open port
EXPOSE 2121

# Set the default shell to bash instead of sh
ENV SHELL /bin/bash