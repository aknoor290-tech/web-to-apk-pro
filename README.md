---
title: Web-to-APK Pro
emoji: 📱
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
app_port: 7860
---

# Web-to-APK Converter (Tokyo Night Pro)

A modern, lightweight web application to convert websites into Android APK projects.

## Features
- **Online URL Mode**: Enter any URL to generate an APK project.
- **Offline Source Mode**: Upload your HTML/JS/CSS files.
- **Advanced Customization**: Icon, Splash Screen, Permissions, Custom JS, Navigation Styles, and more.
- **Cloud Build**: Generates a ZIP with a GitHub Action for automatic APK building.
- **Interactive UI**: Tokyo Night theme with a physics-based character.

## Deployment
This project is designed to run on **Hugging Face Spaces** using Docker.

### Local Development
1. Install dependencies: `npm install`
2. Start the server: `npm start`
3. Open `http://localhost:7860`

### Hugging Face Deployment
The project includes a `Dockerfile` and a GitHub Action to sync with Hugging Face.

1. Create a **Docker Space** on Hugging Face.
2. Add `HF_TOKEN` and `HF_USERNAME` to your GitHub repository secrets.
3. Push to GitHub, and it will automatically sync to Hugging Face.
 
