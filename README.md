# Visual Intelligent Automation (VIA) Platform

A powerful web test automation platform built with Node.js and Playwright.

## Features

- 🎯 Visual test recording and playback
- 📹 Video recording of test execution
- 📊 Test history and analytics
- 📧 Email alerts for test failures
- 🔄 Test suite management
- 🎮 Live VNC viewer for test monitoring
- ⏰ Scheduled test execution

## Tech Stack

- **Backend**: Node.js, Express
- **Testing**: Playwright
- **Frontend**: HTML5, JavaScript, CSS3
- **Database**: JSON file storage
- **Email**: Nodemailer with SMTP support

## Getting Started

### Prerequisites

- Node.js 16+ 
- npm or yarn

### Installation

```bash
npm install
npx playwright install chromium
```

### Running the Application

```bash
node server-working.js
```

The application will be available at `http://localhost:8288`

## Pages

- `/` - Dashboard
- `/scripts.html` - Test scripts management
- `/suites.html` - Test suites management
- `/history.html` - Test execution history
- `/alerts.html` - Email alert configuration
- `/analytics.html` - Test analytics
- `/schedule.html` - Test scheduling

## License

MIT

## Author

Developed by midhunp1