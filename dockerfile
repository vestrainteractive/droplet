FROM node:16-alpine

# Install ClamAV and its dependencies
RUN apk add --no-cache clamav clamav-libunrar

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker layer caching
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Set environment variables
ENV PORT=80
ENV SMTP_HOST=${SMTP_HOST}
ENV SMTP_PORT=${SMTP_PORT}
ENV SMTP_SECURE=${SMTP_SECURE}
ENV SMTP_USER=${SMTP_USER}
ENV SMTP_PASS=${SMTP_PASS}
ENV EMAIL_TO=${EMAIL_TO}

# Create the uploads directory
RUN mkdir -p /var/html/uploads

# Expose port 80
EXPOSE 80

# Start the application
CMD ["node", "server.js"]