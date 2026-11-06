const { defineConfig } = require("cypress");

module.exports = defineConfig({
	video: true,
	videosFolder: "cypress/videos",
	screenshotsFolder: "cypress/screenshots",
	screenshotOnRunFailure: true,
	e2e: {
		supportFile: false,
		specPattern: "cypress/e2e/**/*.cy.js",
		baseUrl: "http://127.0.0.1:4173",
	},
});
