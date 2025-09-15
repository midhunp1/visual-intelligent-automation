const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

class EmailService {
    constructor() {
        this.transporter = null;
        this.settings = null;
        this.settingsFile = path.join(__dirname, 'data', 'alert-settings.json');
        this.historyFile = path.join(__dirname, 'data', 'alert-history.json');
    }

    async loadSettings() {
        try {
            const data = await fs.readFile(this.settingsFile, 'utf8');
            this.settings = JSON.parse(data);
            return this.settings;
        } catch (error) {
            // Default settings if file doesn't exist
            this.settings = {
                enabled: false,
                email: {
                    enabled: false,
                    smtp: {
                        server: 'smtp.zoho.com',
                        port: 465,
                        secure: true
                    },
                    sender: '',
                    password: '',
                    recipients: []
                },
                preferences: {
                    alertOnTestFailures: true,
                    alertOnSuiteFailures: true,
                    includeErrorDetails: true,
                    includeSuggestions: true,
                    batchAlerts: false,
                    dailySummary: false
                }
            };
            return this.settings;
        }
    }

    async saveSettings(settings) {
        try {
            this.settings = settings;
            await fs.writeFile(this.settingsFile, JSON.stringify(settings, null, 2));
            
            // Reinitialize transporter with new settings
            if (settings.email.enabled && settings.email.sender && settings.email.password) {
                this.initializeTransporter();
            }
            
            return true;
        } catch (error) {
            console.error('Error saving settings:', error);
            throw error;
        }
    }

    initializeTransporter() {
        if (!this.settings || !this.settings.email.sender || !this.settings.email.password) {
            throw new Error('Email settings not configured');
        }

        this.transporter = nodemailer.createTransport({
            host: this.settings.email.smtp.server,
            port: this.settings.email.smtp.port,
            secure: this.settings.email.smtp.secure,
            auth: {
                user: this.settings.email.sender,
                pass: this.settings.email.password
            }
        });
    }

    async testConnection() {
        try {
            if (!this.transporter) {
                this.initializeTransporter();
            }
            
            await this.transporter.verify();
            return { success: true, message: 'Connection successful' };
        } catch (error) {
            console.error('Email connection test failed:', error);
            return { 
                success: false, 
                error: error.message || 'Connection failed'
            };
        }
    }

    async sendTestEmail() {
        try {
            if (!this.settings || !this.settings.email.recipients || this.settings.email.recipients.length === 0) {
                throw new Error('No recipients configured');
            }

            const recipients = this.settings.email.recipients.map(r => r.email).join(', ');

            const mailOptions = {
                from: this.settings.email.sender,
                to: recipients,
                subject: '✅ VIA Platform - Test Alert Configuration Successful',
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
                            <h2 style="margin: 0;">🎯 VIA Test Automation Platform</h2>
                            <p style="margin: 5px 0 0 0; opacity: 0.9;">Alert System Test</p>
                        </div>
                        
                        <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb;">
                            <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                                <h3 style="color: #10B981; margin-top: 0;">✅ Email Alerts Configured Successfully!</h3>
                                <p style="color: #4B5563;">This is a test email to confirm that your alert settings are working correctly.</p>
                                
                                <div style="background: #F3F4F6; padding: 15px; border-radius: 6px; margin: 20px 0;">
                                    <p style="margin: 0; color: #1F2937;"><strong>Configuration Summary:</strong></p>
                                    <ul style="color: #4B5563; margin: 10px 0;">
                                        <li>SMTP Server: ${this.settings.email.smtp.server}</li>
                                        <li>Sender: ${this.settings.email.sender}</li>
                                        <li>Recipients: ${this.settings.email.recipients.length} configured</li>
                                        <li>Alert on Test Failures: ${this.settings.preferences.alertOnTestFailures ? '✅' : '❌'}</li>
                                        <li>Alert on Suite Failures: ${this.settings.preferences.alertOnSuiteFailures ? '✅' : '❌'}</li>
                                    </ul>
                                </div>
                                
                                <p style="color: #6B7280; font-size: 14px;">
                                    You will receive email alerts when tests fail based on your configured preferences.
                                </p>
                            </div>
                        </div>
                        
                        <div style="background: #1F2937; color: #9CA3AF; padding: 15px; text-align: center; font-size: 12px;">
                            <p style="margin: 0;">VIA Platform - Visual Test Automation</p>
                            <p style="margin: 5px 0 0 0;">© 2024 All rights reserved</p>
                        </div>
                    </div>
                `
            };

            await this.transporter.sendMail(mailOptions);
            return { success: true, message: 'Test email sent successfully' };
        } catch (error) {
            console.error('Failed to send test email:', error);
            return { 
                success: false, 
                error: error.message || 'Failed to send test email'
            };
        }
    }

    async sendFailureAlert(testData) {
        try {
            if (!this.settings || !this.settings.enabled || !this.settings.email.enabled) {
                console.log('Email alerts are disabled');
                return { success: false, error: 'Alerts disabled' };
            }

            if (!this.settings.email.recipients || this.settings.email.recipients.length === 0) {
                console.log('No recipients configured');
                return { success: false, error: 'No recipients' };
            }

            // Check preferences
            if (testData.type === 'script' && !this.settings.preferences.alertOnTestFailures) {
                return { success: false, error: 'Test failure alerts disabled' };
            }
            
            if (testData.type === 'suite' && !this.settings.preferences.alertOnSuiteFailures) {
                return { success: false, error: 'Suite failure alerts disabled' };
            }

            if (!this.transporter) {
                this.initializeTransporter();
            }

            const recipients = this.settings.email.recipients.map(r => r.email).join(', ');
            const failureDetails = testData.failureDetails || {};

            // Build email content
            let htmlContent = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%); color: white; padding: 20px; border-radius: 10px 10px 0 0;">
                        <h2 style="margin: 0;">⚠️ Test Failure Alert</h2>
                        <p style="margin: 5px 0 0 0; opacity: 0.9;">${testData.type === 'suite' ? 'Test Suite' : 'Test'} Failed</p>
                    </div>
                    
                    <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb;">
                        <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                            <h3 style="color: #DC2626; margin-top: 0;">❌ ${testData.name}</h3>
                            
                            <div style="background: #FEF2F2; border-left: 4px solid #EF4444; padding: 15px; margin: 20px 0;">
                                <p style="margin: 0; color: #991B1B;"><strong>Status:</strong> ${testData.status}</p>
                                <p style="margin: 5px 0 0 0; color: #991B1B;"><strong>Time:</strong> ${new Date(testData.startTime).toLocaleString()}</p>
                                ${testData.durationFormatted ? `<p style="margin: 5px 0 0 0; color: #991B1B;"><strong>Duration:</strong> ${testData.durationFormatted}</p>` : ''}
                            </div>
            `;

            // Add failure details if available
            if (failureDetails.attemptedAction || failureDetails.step) {
                htmlContent += `
                            <div style="background: #FFF7ED; border: 1px solid #FED7AA; padding: 15px; border-radius: 6px; margin: 20px 0;">
                                <h4 style="color: #92400E; margin-top: 0;">What Happened:</h4>
                `;
                
                if (failureDetails.step) {
                    htmlContent += `<p style="color: #78350F; margin: 5px 0;"><strong>Failed at:</strong> Step ${failureDetails.step} in ${failureDetails.script}</p>`;
                }
                
                if (failureDetails.attemptedAction) {
                    htmlContent += `<p style="color: #78350F; margin: 5px 0;"><strong>Action:</strong> ${failureDetails.attemptedAction}</p>`;
                }
                
                htmlContent += `</div>`;
            }

            // Add suggestions if enabled
            if (this.settings.preferences.includeSuggestions && failureDetails.suggestion) {
                htmlContent += `
                            <div style="background: #DBEAFE; border: 1px solid #93C5FD; padding: 15px; border-radius: 6px; margin: 20px 0;">
                                <h4 style="color: #1E40AF; margin-top: 0;">💡 Suggested Fix:</h4>
                                <p style="color: #1E3A8A; margin: 5px 0;">${failureDetails.suggestion}</p>
                            </div>
                `;
            }

            // Add error details if enabled
            if (this.settings.preferences.includeErrorDetails && failureDetails.errorMessage) {
                htmlContent += `
                            <details style="margin-top: 20px;">
                                <summary style="cursor: pointer; color: #6B7280; font-size: 14px;">Technical Details</summary>
                                <div style="background: #F3F4F6; padding: 10px; border-radius: 4px; margin-top: 10px;">
                                    <code style="font-size: 12px; color: #374151;">${failureDetails.errorMessage}</code>
                                </div>
                            </details>
                `;
            }

            // Add action button
            htmlContent += `
                            <div style="margin-top: 30px; text-align: center;">
                                <a href="http://localhost:8288/history.html" style="display: inline-block; background: #3B82F6; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 500;">
                                    View Full Details
                                </a>
                            </div>
                        </div>
                    </div>
                    
                    <div style="background: #1F2937; color: #9CA3AF; padding: 15px; text-align: center; font-size: 12px;">
                        <p style="margin: 0;">VIA Platform - Visual Test Automation</p>
                        <p style="margin: 5px 0 0 0;">This is an automated alert. Do not reply to this email.</p>
                    </div>
                </div>
            `;

            const mailOptions = {
                from: this.settings.email.sender,
                to: recipients,
                subject: `❌ Test Failed: ${testData.name}`,
                html: htmlContent
            };

            await this.transporter.sendMail(mailOptions);
            console.log('Alert email sent successfully');
            
            // Save to history
            await this.saveAlertToHistory({
                testName: testData.name,
                testType: testData.type || 'script',
                status: 'sent',
                recipients: this.settings.email.recipients.length,
                emailSent: true
            });
            
            return { success: true, message: 'Alert sent' };
        } catch (error) {
            console.error('Failed to send alert email:', error);
            
            // Save failed attempt to history
            await this.saveAlertToHistory({
                testName: testData.name,
                testType: testData.type || 'script',
                status: 'failed',
                recipients: this.settings.email.recipients.length,
                emailSent: false,
                error: error.message
            });
            
            return { 
                success: false, 
                error: error.message || 'Failed to send alert'
            };
        }
    }

    async saveAlertToHistory(alertData) {
        try {
            let history = [];
            try {
                const data = await fs.readFile(this.historyFile, 'utf8');
                history = JSON.parse(data);
            } catch (error) {
                // File doesn't exist yet, start with empty array
            }

            // Add new alert to beginning
            history.unshift({
                timestamp: new Date().toISOString(),
                testName: alertData.testName,
                testType: alertData.testType,
                status: alertData.status,
                recipients: alertData.recipients,
                emailSent: alertData.emailSent,
                error: alertData.error || null
            });

            // Keep only last 100 alerts
            if (history.length > 100) {
                history = history.slice(0, 100);
            }

            await fs.writeFile(this.historyFile, JSON.stringify(history, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving alert history:', error);
            return false;
        }
    }

    async getAlertHistory() {
        try {
            const data = await fs.readFile(this.historyFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // Return empty array if file doesn't exist
            return [];
        }
    }
}

module.exports = EmailService;