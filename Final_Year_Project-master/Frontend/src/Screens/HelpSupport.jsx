import React from 'react';

const HelpSupport = () => {
  return (
    <div className="dashboard-section">
      <h2>Help & Support</h2>
      <div className="faq-section">
        <h3>Frequently Asked Questions</h3>
        <div className="faq-item">
          <h4>How do I post a ride?</h4>
          <p>Click on the "Post a Ride" button on the dashboard and fill out the form with your ride details.</p>
        </div>
        <div className="faq-item">
          <h4>How do I find a ride?</h4>
          <p>Use the AI agent button in the bottom right corner to search for available rides based on your criteria.</p>
        </div>
        <div className="faq-item">
          <h4>How is money saved calculated?</h4>
          <p>Money saved is calculated based on the difference between the cost of your ride and the estimated cost of alternative transportation.</p>
        </div>
      </div>
      <div className="contact-support">
        <h3>Contact Support</h3>
        <p>Email: support@colonycarpool.com</p>
        <p>Phone: +1 (555) 123-4567</p>
      </div>
    </div>
  );
};

export default HelpSupport;