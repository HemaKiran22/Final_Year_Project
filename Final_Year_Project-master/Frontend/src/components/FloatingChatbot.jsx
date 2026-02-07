import React, { useState } from 'react';
import { FaComments, FaTimes, FaPaperPlane, FaRobot, FaMinus } from 'react-icons/fa';
import './FloatingChatbot.css';
import { askLLM } from '../services/llmService';
import { db, auth } from '../firebase';
import { parseRideQuery } from '../services/nlpAgent';
import { searchRidesByQuery } from '../services/rideSearchService';
import { clusterRides, formatClusterResults } from '../services/clusteringService';
import { autoBookBestRide } from '../services/autoBookService';
import { joinRideById, createOrGetPrivateChat } from '../services/rideActionService';
import { createRideFromPrompt } from '../services/ridePostService';
import { useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

const FloatingChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    { from: 'bot', text: 'Hi! I\'m your AI assistant for carpool and app help. Ask me anything or pick a quick help topic.' },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  // Guided post-ride wizard state
  const [postWizard, setPostWizard] = useState(null); // { step, dest, date, time, seats, price, vehicleType }
  const navigate = useNavigate();
    const greetingResponse = (text) => {
      const t = text.trim().toLowerCase();
      const greetings = ['hi', 'hello', 'hey', 'hai', 'hii', 'yo', 'sup'];
      if (greetings.includes(t) || /^hi[.!]?$/.test(t) || /^hello[.!]?$/.test(t)) {
        return (
          "Hi! I'm your AI assistant for the carpool app.\n" +
          "- To find rides: e.g., 'Find rides to Kumbalagodu on 2026-01-03 around 12:00'.\n" +
          "- To auto-book: e.g., 'Book a ride to Kumbalagodu on 2026-01-03 around 12:00'.\n" +
          "- Use quick help buttons below for common tasks."
        );
      }
      return null;
    };
    const siteHowResponse = (text) => {
      const t = text.trim().toLowerCase();
      const patterns = [
        'how this website works',
        'how does this website work',
        'how does this site work',
        'how it works',
        'how does it work',
        'how this app works',
        'how the website works',
        'how the app works',
        // New phrasing variants
        'explain about this website',
        'explain this website',
        'about this website',
        'website overview',
        'overview of this website',
        'explain about the website',
        'explain about site',
        'explain about app',
        'explain this app',
        'about this app'
      ];
      if (patterns.some(p => t.includes(p))) {
        return (
          'How this website works:\n' +
          '- Post a ride from Dashboard: destination, date, time, seats, price.\n' +
          '- Find and join rides using the chatbot: search or auto-book from your prompt.\n' +
          '- Accept rides from clustered suggestions with explanations and savings.\n' +
          '- Chat with others: Private Chat with driver or Group Chat to coordinate.\n' +
          '- Notifications alert you when someone joins or messages; check the bell on Dashboard.\n' +
          '- Savings and leaderboard update as you complete rides.\n' +
          "Try: 'Find rides to Kumbalagodu on 2026-01-03 around 12:00' or 'Book a ride to Kumbalagodu on 2026-01-03 around 12:00'."
        );
      }
      return null;
    };
    const parseLoginIntent = (text) => {
      const t = text.trim();
      const low = t.toLowerCase();
      const intent = low.includes('login') || low.includes('log me in') || low.includes('sign in');
      if (!intent) return null;
      const emailMatch = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      const pwdMatch = t.match(/password\s*[:=]\s*([^\s].*)$/i);
      const email = emailMatch ? emailMatch[0] : null;
      const password = pwdMatch ? pwdMatch[1].trim() : null;
      if (email && password) return { email, password };
      return { email, password, intent: true };
    };
    const parseSignupIntent = (text) => {
      const t = text.trim();
      const low = t.toLowerCase();
      const intent = low.includes('sign up') || low.includes('signup') || low.includes('register') || low.includes('create account');
      if (!intent) return null;
      const emailMatch = t.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
      const pwdMatch = t.match(/password\s*[:=]\s*([^\s].*)$/i);
      const email = emailMatch ? emailMatch[0] : null;
      const password = pwdMatch ? pwdMatch[1].trim() : null;
      if (email && password) return { email, password };
      return { email, password, intent: true };
    };
    const siteHelpResponse = (text) => {
      const t = text.trim().toLowerCase();
      const patterns = [
        'how this website helps users',
        'how does this website help users',
        'how this app helps users',
        'how this app helps',
        'benefits of this website',
        'benefits of this app',
        'why use this app',
        'why use this website',
        'how it helps users',
        'how does it help users'
      ];
      if (patterns.some(p => t.includes(p))) {
        return (
          'How this website helps users:\n' +
          '- Save money: share fares and see per-person cost on groups.\n' +
          '- Save time: find nearest-time rides and auto-book from your prompt.\n' +
          '- Eco-friendly: reduce CO₂ vs solo travel with optimized carpooling.\n' +
          '- Safer coordination: Private Chat with drivers and Group Chat for logistics.\n' +
          '- Smart suggestions: clustered groups with XAI explanations and tips.\n' +
          '- Stay informed: notifications for joins/messages; dashboard overview.\n' +
          '- Community: Society Feed and Leaderboard to track savings and progress.'
        );
      }
      return null;
    };
    const smallTalkResponse = (text) => {
      const t = text.trim().toLowerCase();
      const patterns = [
        'how are you',
        'how r u',
        "how's it going",
        'hows it going',
        'how are u',
        'how you doing',
        'how are things',
        'how do you do'
      ];
      if (patterns.some(p => t.includes(p))) {
        return (
          "I'm doing great and ready to help with rides and app support!\n" +
          "- Ask me to find or book a ride.\n" +
          "- Or use the quick help buttons below for common tasks."
        );
      }
      return null;
    };
    const genericAssistResponse = (text) => {
      const t = (text || '').trim();
      return (
        (t ? `You asked: "${t}"\n` : '') +
        'I\'m optimized for carpool tasks: finding/booking rides, chats, notifications, clustering, and savings.\n' +
        '- If this is about rides, include destination/date/time (e.g., "Find rides to Kumbalagodu on 2026-01-03 around 12:00").\n' +
        '- For app help, try Quick help buttons below.\n' +
        'If general knowledge is needed, ensure the AI backend is configured; I\'ll still do my best to guide you.'
      );
    };
    // --- Helpers: saved searches, calendar, match explain, book best ---
    const saveSearch = (q) => {
      try {
        const key = 'cc_saved_searches';
        const prev = JSON.parse(localStorage.getItem(key) || '[]');
        const entry = { destination: q.destination || '', dateISO: q.dateISO || '', time24: q.time24 || '', minDriverRating: q.minDriverRating || null, ts: Date.now() };
        localStorage.setItem(key, JSON.stringify([entry, ...prev].slice(0, 10)));
        return true;
      } catch { return false; }
    };
    const loadSavedSearches = () => {
      try {
        const key = 'cc_saved_searches';
        return JSON.parse(localStorage.getItem(key) || '[]');
      } catch { return []; }
    };
    const toUtcIcsDateTime = (dateISO, time24) => {
      try {
        const d = new Date(`${dateISO}T${(time24 || '00:00')}:00`);
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, '0');
        const day = String(d.getUTCDate()).padStart(2, '0');
        const hh = String(d.getUTCHours()).padStart(2, '0');
        const mm = String(d.getUTCMinutes()).padStart(2, '0');
        const ss = '00';
        return `${y}${m}${day}T${hh}${mm}${ss}Z`;
      } catch { return null; }
    };
    const downloadICS = (ride) => {
      try {
        const dtStart = toUtcIcsDateTime(ride.date, ride.time) || '';
        const dtEnd = dtStart; // simple one-time slot
        const uid = `${ride.id || Math.random().toString(36).slice(2)}@colonycarpool`;
        const title = `Carpool to ${ride.destination}`;
        const body = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//Colony Carpool//AI Agent//EN',
          'CALSCALE:GREGORIAN',
          'METHOD:PUBLISH',
          'BEGIN:VEVENT',
          `UID:${uid}`,
          dtStart ? `DTSTART:${dtStart}` : '',
          dtEnd ? `DTEND:${dtEnd}` : '',
          `SUMMARY:${title}`,
          `DESCRIPTION:Driver ${ride.driverName || ''} • Price ₹${Number(ride.price || 0)} • Seats ${ride.seats || ''}`,
          'END:VEVENT',
          'END:VCALENDAR'
        ].filter(Boolean).join('\r\n');
        const blob = new Blob([body], { type: 'text/calendar;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `carpool-${ride.destination}-${ride.date}.ics`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {}
    };
    const timeToMinutes = (t) => {
      if (!t) return null;
      const [h, m] = String(t).split(':').map(Number);
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };
    const explainMatch = (ride, q) => {
      const parts = [];
      if (q?.time24 && ride.time) {
        const diff = Math.abs(timeToMinutes(ride.time) - timeToMinutes(q.time24));
        parts.push(`~${diff} min from your time`);
      }
      const left = (ride.seats || 1) - (Array.isArray(ride.passengers) ? ride.passengers.length : 0);
      parts.push(`${left} seat(s) left`);
      if (ride.driverAverageRating != null) parts.push(`${ride.driverAverageRating.toFixed(1)}★ driver`);
      return parts.join(' · ');
    };
    const handleBookBestFromQuery = async (q) => {
      const userNameHint = auth?.currentUser?.displayName || auth?.currentUser?.email || '';
      const summary = `Booking a ride${q.destination ? ` to ${q.destination}` : ''}${q.dateISO ? ` on ${q.dateISO}` : ''}${q.time24 ? ` around ${q.time24}` : ''}${q.minDriverRating ? ` with ${q.minDriverRating}★ drivers` : ''}…`;
      const booking = await autoBookBestRide(db, auth, q, userNameHint);
      setIsLoading(false);
      setMessages(prev => [...prev, booking.ok
        ? { from: 'bot', type: 'booked-ride', text: `${summary} Done! You have been added to the ride to ${booking.ride.destination} on ${booking.ride.date} at ${booking.ride.time}.`, ride: booking.ride }
        : { from: 'bot', text: `${summary} ${booking.message || 'Unable to book a ride.'}` }
      ]);
    };
    const formatLLMFallback = (text, error) => {
      const base = genericAssistResponse(text);
      const err = (error && String(error).trim()) ? `\nLLM error: ${error}` : '';
      return base + err;
    };
    const colonyCarpoolResponse = (text) => {
      const t = text.trim().toLowerCase();
      const patterns = [
        'what is colony carpool',
        'tell me about colony carpool',
        'colony carpool',
        'what is this app',
        'what is this website'
      ];
      if (patterns.some(p => t.includes(p))) {
        return (
          'Colony Carpool:\n' +
          '- A community/campus carpool platform to share rides safely and efficiently.\n' +
          '- Post rides (destination, date, time, seats, price) from Dashboard.\n' +
          '- Find and join rides via the chatbot or suggested/clustered groups.\n' +
          '- Smart clustering forms optimized groups and shows XAI explanations, savings, and CO₂ reduction.\n' +
          '- Auto-book from a prompt when enabled, or list-only if you say “search/find/show”.\n' +
          '- Chat with others: Private Chat with the driver and Group Chat to coordinate.\n' +
          '- Get notifications when someone joins or messages; track savings and leaderboard progress.\n' +
          "Try: 'Find rides to Kumbalagodu on 2026-01-03 around 12:00' or 'Book a ride to Kumbalagodu on 2026-01-03 around 12:00'."
        );
      }
      return null;
    };
  const helpResponses = {
    'cannot login': (
      'Login help:\n' +
      '- Open the Login screen and sign in with your account.\n' +
      '- If signup is needed, go to Signup and create an account.\n' +
      '- Check Firebase auth settings and network connectivity.\n' +
      '- After login, you can Accept rides or start Private Chat.'
    ),
    'how to join a ride?': (
      'Join a ride:\n' +
      '- Use this chatbot: search and tap Accept on a ride card.\n' +
      '- Or on Dashboard, use Suggested/Clustered rides and accept there.\n' +
      '- You must be logged in and seats must be available.'
    ),
    'notifications not showing': (
      'Notifications help:\n' +
      '- Bell icon on Dashboard shows unread notifications.\n' +
      '- We added a fallback query; create the composite index if prompted.\n' +
      '- Enable browser notification permission for reminders.'
    ),
    'map not loading': (
      'Map tips:\n' +
      '- Check internet and allow location permissions.\n' +
      '- Hard refresh the page; ensure API keys are correct.\n' +
      '- If issue persists, report via notifications or chat.'
    ),
    'i need human help': (
      'Human help:\n' +
      '- Start a Private Chat with the driver/passenger from the ride card.\n' +
      '- Or use group chat via Dashboard ride card.\n' +
      '- You can also post in Society Feed for help.'
    ),
    'payment or savings incorrect': (
      'Payment & savings:\n' +
      '- Savings are computed per ride based on price and seats.\n' +
      '- Confirm the ride to update your savings and stats.\n' +
      '- If incorrect, contact the driver via Private Chat or report.'
    ),
    'cannot find a ride': (
      'Find a ride:\n' +
      '- Use a prompt like: "Find rides to Kumbalagodu on 2026-01-03 around 12:00".\n' +
      '- The agent searches by destination/date/time and shows nearest matches.\n' +
      '- If none appear, try a nearby time or adjust destination spelling.'
    ),
    'change my destination or time': (
      'Change ride:\n' +
      '- If you posted the ride, edit the details from Dashboard (or repost).\n' +
      '- If you joined, message in Private Chat to request a change.\n' +
      '- You can search and accept a different ride via the chatbot.'
    ),
    'how to post a ride?': (
      'Post a ride:\n' +
      '- Go to Dashboard and click Post Ride.\n' +
      '- Fill destination, date, time, seats, and price, then submit.\n' +
      '- Your ride appears as Pending and passengers can accept.'
    ),
    'contact driver or passenger': (
      'Contact options:\n' +
      '- Use Private Chat on the ride card to message the driver directly.\n' +
      '- Or open Group Chat from Dashboard ride cards to coordinate.\n' +
      '- Notifications are sent when someone joins or messages.'
    ),
    'how this website works': (
      'How this website works:\n' +
      '- Post a ride from Dashboard: destination, date, time, seats, price.\n' +
      '- Find and join rides using the chatbot: search or auto-book from your prompt.\n' +
      '- Accept rides from clustered suggestions with explanations and savings.\n' +
      '- Chat with others: Private Chat with driver or Group Chat to coordinate.\n' +
      '- Notifications alert you when someone joins or messages; check the bell on Dashboard.\n' +
      '- Savings and leaderboard update as you complete rides.\n' +
      "Try: 'Find rides to Kumbalagodu on 2026-01-03 around 12:00' or 'Book a ride to Kumbalagodu on 2026-01-03 around 12:00'."
    ),
    'what is colony carpool': (
      'Colony Carpool:\n' +
      '- A community/campus carpool platform to share rides safely and efficiently.\n' +
      '- Post rides (destination, date, time, seats, price) from Dashboard.\n' +
      '- Find and join rides via the chatbot or suggested/clustered groups.\n' +
      '- Smart clustering forms optimized groups and shows XAI explanations, savings, and CO₂ reduction.\n' +
      '- Auto-book from a prompt when enabled, or list-only if you say “search/find/show”.\n' +
      '- Chat with others: Private Chat with the driver and Group Chat to coordinate.\n' +
      '- Get notifications when someone joins or messages; track savings and leaderboard progress.\n' +
      "Try: 'Find rides to Kumbalagodu on 2026-01-03 around 12:00' or 'Book a ride to Kumbalagodu on 2026-01-03 around 12:00'."
    ),
    // Account
    'how do i sign up?': (
      'Signup:\n- Go to Signup and create your account with email and password.\n- Verify your email if prompted.\n- After signup, you can post, find, and join rides.'
    ),
    'reset password': (
      'Reset password:\n- Use the “Forgot password” link on Login to receive a reset email.\n- Follow the email instructions to set a new password.'
    ),
    'update profile': (
      'Update profile:\n- Open Profile screen to change name, photo, and other details.\n- Save changes to update your account.'
    ),
    'delete account': (
      'Delete account:\n- Request account deletion from Settings or Help & Support.\n- Note: deleting removes rides, chats, and associated data where possible.'
    ),
    'verify email': (
      'Verify email:\n- Check your inbox for a verification email.\n- Click the link to verify.\n- Re-send verification from Profile if needed.'
    ),
    'auto logout why': (
      'Auto-logout:\n- For security and session freshness, you may be logged out after inactivity or token expiry.\n- Log in again to continue.'
    ),
    // Payments & Savings
    'price calculation': (
      'Price calculation:\n- Set by the driver when posting the ride (per passenger or total).\n- Savings are computed per ride and reflected in your stats.'
    ),
    'split fare': (
      'Split fare:\n- Fares are shared among passengers based on seats and price.\n- Confirm with the driver via Private Chat for exact split.'
    ),
    'refund policy': (
      'Refunds:\n- If a ride is canceled, coordinate with the driver for refunds if applicable.\n- Use chat to resolve payment issues.'
    ),
    'promo codes': (
      'Promo codes:\n- If enabled, you can apply a promo during booking/posting.\n- Availability may vary per event or community.'
    ),
    'show my savings': (
      'Savings:\n- View cumulative savings on Dashboard/Leaderboard.\n- Completing rides updates your savings automatically.'
    ),
    'per person cost': (
      'Per person cost:\n- Computed from total price and number of passengers.\n- Shown on clustered group cards and ride details.'
    ),
    'leaderboard score': (
      'Leaderboard score:\n- Based on rides completed, savings, and participation.\n- Improves as you share more rides.'
    ),
    // Chat & Notifications
    'start private chat': (
      'Private Chat:\n- From a ride card, tap “Private Chat” to message the driver directly.\n- Use it to coordinate pickup and details.'
    ),
    'open group chat': (
      'Group Chat:\n- Open group chat from the ride card or Dashboard.\n- Coordinate timing, pickup points, and passenger updates.'
    ),
    'mute notifications': (
      'Mute notifications:\n- Use browser/site notification settings to mute.\n- You can also mark notifications as read from Dashboard.'
    ),
    'mark notifications read': (
      'Mark as read:\n- Click the bell icon; unread items can be marked read.\n- We added fallback when an index is missing.'
    ),
    'enable push notifications': (
      'Enable push:\n- Allow browser notification permission when prompted.\n- Check OS-level settings if prompts are blocked.'
    ),
    'report message or user': (
      'Report:\n- Use Help & Support or contact admins to report abuse.\n- Provide ride/chat details for faster action.'
    ),
    'share contact in chat': (
      'Share contact:\n- You can share your phone/email in Private Chat if comfortable.\n- Avoid posting personal data publicly.'
    ),
    // Clustering & XAI
    'what are clustered groups': (
      'Clustered groups:\n- Our algorithm groups nearby riders by route/time to optimize sharing.\n- Cards show seats, per-person cost, and explanations.'
    ),
    'why this group suggested': (
      'Why suggested:\n- Based on time window, route proximity, capacity, and savings.\n- See “Why this group?” for XAI explanation and tips.'
    ),
    'what is time window': (
      'Time window:\n- A matching tolerance (e.g., ±30 min) around your requested time.\n- Helps align pickup and travel efficiently.'
    ),
    'pickup proximity meaning': (
      'Pickup proximity:\n- Average distance between pickup points in the group.\n- Lower proximity improves convenience and coordination.'
    ),
    'co2 savings estimate': (
      'CO₂ savings:\n- Estimated emissions reduction vs solo travel.\n- Shown as a percentage on group cards.'
    ),
    'improve my match': (
      'Improve match:\n- Adjust time or pickup location slightly to fit better.\n- Consider nearby groups with small time shifts.'
    ),
    'group is full why': (
      'Group full:\n- Capacity reached.\n- Try a similar group or message in chat if a seat opens.'
    ),
    // Maps & Locations
    'update pickup location': (
      'Update pickup:\n- Edit your pickup in Profile or discuss in Private Chat.\n- Ensure location permissions are enabled.'
    ),
    'add a stop': (
      'Add a stop:\n- Coordinate with the driver via Group/Private Chat.\n- Stops should be agreed upon by all passengers.'
    ),
    'best route to destination': (
      'Best route:\n- The app suggests route segments; drivers choose final route.\n- Use map view to preview and adjust pickup.'
    ),
    'share my location': (
      'Share location:\n- You may share location via chat when safe.\n- Enable permissions for accurate pickup points.'
    ),
    'change destination after joining': (
      'Change destination:\n- If you joined, request changes via Private Chat.\n- Otherwise search and accept a different ride.'
    ),
    'location inaccurate': (
      'Location accuracy:\n- Calibrate GPS, enable high-accuracy mode, and refresh.\n- Check network connectivity.'
    ),
    'allow location permissions': (
      'Location permissions:\n- Allow location access when prompted by the browser.\n- Check site settings if previously denied.'
    ),
    // Safety & Privacy
    'safety tips': (
      'Safety tips:\n- Verify driver/passenger identity and meetup points.\n- Share ride details with trusted contacts.\n- Use chat to confirm timing and pickup.'
    ),
    'verify driver or passenger': (
      'Verify users:\n- Review profile details and previous ride history.\n- Message in chat to confirm identity/address.'
    ),
    'report issue or abuse': (
      'Report abuse:\n- Use Help & Support; include screenshots and ride IDs.\n- Admins can take action on violations.'
    ),
    'block a user': (
      'Block user:\n- Request a block via Help & Support if needed.\n- Provide the profile/ride link for reference.'
    ),
    'what data is stored': (
      'Data stored:\n- Basic profile, rides, chats, and notifications to operate the app.\n- See Privacy Policy for details.'
    ),
    'who can see my profile': (
      'Profile visibility:\n- Participants in your rides can see relevant info.\n- Sensitive data is limited to necessary fields.'
    ),
    'are chats secure': (
      'Chat security:\n- Stored securely; only participants can view.\n- Follow community guidelines.'
    ),
    'hide contact details': (
      'Hide contact:\n- Don’t share personal details publicly; prefer Private Chat.\n- Control profile fields in settings.'
    ),
    // Troubleshooting
    'query requires index error': (
      'Index error:\n- Create the Firestore composite index when prompted.\n- We added a fallback that still shows notifications using client-side filters.'
    ),
    'auto-book not working': (
      'Auto-book issues:\n- Ensure you’re logged in and provide destination/date/time.\n- Say “search/find/show” to list-only; otherwise auto-book if enabled.'
    ),
    'wrong time parsed': (
      'Time parsing:\n- Use clear formats like 12:00, 12:00 PM, or 14:30.\n- Include a date: YYYY-MM-DD or D/M/YYYY to avoid ambiguity.'
    ),
    'no rides for today': (
      'No rides today:\n- Try nearby times or adjust destination spelling.\n- The agent also shows nearest times when exact matches fail.'
    ),
    'app slow': (
      'Performance:\n- Hard refresh, check network, and restart dev server if needed.\n- Clear cache or reload the page.'
    ),
    'zero seats issue': (
      'Seats issue:\n- If seats show zero, the ride may be full or seat counts are outdated.\n- Refresh or ask the driver in chat.'
    ),
    'cannot post ride': (
      'Post ride error:\n- Ensure destination, date, seats, and price are filled.\n- Check connectivity and try again.'
    ),
    'required fields to post': (
      'Required fields:\n- Destination, date, time (recommended), seats, and price.\n- Confirm status shows as Pending after posting.'
    ),
    'chat failed to open': (
      'Chat open error:\n- Try again and confirm you’re logged in.\n- If it persists, report via Help & Support.'
    ),
    // Customization
    'turn off auto-book': (
      'Disable auto-book:\n- Set VITE_AUTO_BOOK=false in environment or explicitly say “search/find/show” to list only.\n- Restart dev server after env changes.'
    ),
    'set different time window': (
      'Time window setting:\n- Mention a preferred window in your prompt (e.g., “±20 minutes”).\n- We can make the window configurable if needed.'
    ),
    'filter by driver rating': (
      'Filter by rating:\n- Add “with 4★ drivers” to your prompt.\n- The agent filters results accordingly.'
    ),
    'sort by nearest time': (
      'Sort by time:\n- Results are ordered by nearest time automatically, with missing-time rides listed after.'
    ),
    'show rides under price': (
      'Max price filter:\n- Include a budget in your prompt (e.g., “under ₹100”).\n- Sorting and filtering prioritize cheaper options.'
    ),
    'change theme': (
      'Theme:\n- UI theming can be added; request a dark/light theme toggle.\n- We can store preference in localStorage.'
    ),
    'customize quick help': (
      'Quick help customization:\n- We can add buttons for your common tasks and map them to canned responses.'
    ),
    'add greeting message': (
      'Greeting:\n- The assistant replies to greetings with usage tips.\n- You can edit the message in the chatbot component.'
    ),
    // App Features
    'what is dashboard': (
      'Dashboard:\n- Central hub to post rides, view suggested/clustered groups, open chats, and see notifications.'
    ),
    'what is society feed': (
      'Society Feed:\n- Community posts and updates; ask for help, share info, and coordinate beyond individual rides.'
    ),
    'what is leaderboard': (
      'Leaderboard:\n- Ranks users by rides completed, savings, and participation.\n- Compete and track progress over time.'
    ),
    'where is help and support': (
      'Help & Support:\n- Find it in the app menu or Dashboard.\n- Report issues, request features, or contact admins.'
    ),
    'how this website helps users': (
      'How this website helps users:\n' +
      '- Save money: share fares and see per-person cost on groups.\n' +
      '- Save time: find nearest-time rides and auto-book from your prompt.\n' +
      '- Eco-friendly: reduce CO₂ vs solo travel with optimized carpooling.\n' +
      '- Safer coordination: Private Chat with drivers and Group Chat for logistics.\n' +
      '- Smart suggestions: clustered groups with XAI explanations and tips.\n' +
      '- Stay informed: notifications for joins/messages; dashboard overview.\n' +
      '- Community: Society Feed and Leaderboard to track savings and progress.'
    ),
  };
  const helpAliases = [
    { key: 'how do i sign up?', patterns: ['sign up', 'signup', 'create account'] },
    { key: 'reset password', patterns: ['forgot password', 'reset my password'] },
    { key: 'update profile', patterns: ['edit profile', 'change profile'] },
    { key: 'delete account', patterns: ['remove account', 'deactivate account'] },
    { key: 'verify email', patterns: ['email verify', 'verification email'] },
    { key: 'start private chat', patterns: ['private chat', 'message driver'] },
    { key: 'open group chat', patterns: ['group chat', 'open group'] },
    { key: 'mute notifications', patterns: ['mute notif', 'silence notifications'] },
    { key: 'mark notifications read', patterns: ['mark read', 'read notifications'] },
    { key: 'query requires index error', patterns: ['requires index', 'index error'] },
    { key: 'auto-book not working', patterns: ['autobook', 'auto book not working'] },
    { key: 'wrong time parsed', patterns: ['wrong time', 'time parsing'] },
    { key: 'turn off auto-book', patterns: ['disable auto-book', 'turn off autobook'] },
    { key: 'filter by driver rating', patterns: ['min rating', '4 star drivers'] },
    { key: 'what is colony carpool', patterns: ['colony carpool', 'what is this app'] },
    { key: 'how this website works', patterns: [
      'how it works',
      'how does this website work',
      'explain about this website',
      'explain this website',
      'website overview',
      'overview of this website',
      'about this website',
      'explain about the website',
      'explain about site',
      'explain about app',
      'explain this app',
      'about this app'
    ] },
    { key: 'how this website helps users', patterns: [
      'how this website helps users',
      'how does this website help users',
      'benefits of this website',
      'benefits of this app',
      'how this app helps',
      'how this app helps users',
      'why use this app',
      'why use this website',
      'how it helps users',
      'how does it help users'
    ] },
  ];

  const maybeHelpResponse = (text) => {
    const t = text.trim().toLowerCase();
    if (helpResponses[t]) return helpResponses[t];
    for (const a of helpAliases) {
      for (const p of a.patterns) {
        if (t.includes(p)) return helpResponses[a.key];
      }
    }
    return null;
  };

  const handleAccept = async (ride) => {
    if (isLoading) return;
    setIsLoading(true);
    const userNameHint = auth?.currentUser?.displayName || auth?.currentUser?.email || '';
    const res = await joinRideById(db, auth, ride, userNameHint);
    setIsLoading(false);
    setMessages(prev => [...prev, { from: 'bot', text: res.ok ? `Joined ride to ${ride.destination} on ${ride.date} at ${ride.time}.` : `Could not join: ${res.message || 'Unknown error'}` }]);
  };

  const handlePrivateChat = async (ride) => {
    try {
      if (!ride?.driverId) {
        setMessages(prev => [...prev, { from: 'bot', text: 'Private Chat is available only when the ride has a driver. Use Group Chat for shared groups.' }]);
        return;
      }
      const res = await createOrGetPrivateChat(db, auth, ride);
      if (res.ok && res.chatId) {
        navigate(`/privatechat/${res.chatId}`);
      } else {
        setMessages(prev => [...prev, { from: 'bot', text: res.message || 'Unable to start private chat.' }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, { from: 'bot', text: e?.message || 'Unable to start private chat.' }]);
    }
  };

  // --- Clustering groups inside chatbot ---
  const fetchActiveRidesForClustering = async () => {
    try {
      const { collection, getDocs, query, where } = await import('firebase/firestore');
      const ridesRef = collection(db, 'rides');
      const q = query(ridesRef, where('status', '==', 'Pending'));
      const snap = await getDocs(q);
      const now = new Date();
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const active = all.filter(r => {
        const taken = Array.isArray(r.passengers) ? r.passengers.length : 0;
        const seats = Number(r.seats || 1);
        if (taken >= seats) return false;
        const dt = new Date(`${r.date || ''} ${r.time || ''}`);
        return dt > now;
      });
      return active.map(ride => ({
        id: ride.id,
        community: ride.community || 'Community',
        destination: ride.destination || 'Destination',
        date: ride.date,
        time: ride.time,
        userName: ride.driverName || 'Driver',
        driverId: ride.driverId || null,
        driverName: ride.driverName || '',
        seats: Number(ride.seats || 1),
        passengers: Array.isArray(ride.passengers) ? ride.passengers : [],
        pickupLat: ride.pickupLat || 12.8420,
        pickupLng: ride.pickupLng || 77.6611,
        pickupLocation: ride.community || 'Community',
        vehicleType: ride.vehicleType || 'car',
      }));
    } catch (e) {
      console.warn('Failed to fetch rides for clustering:', e);
      return [];
    }
  };

  const listClustersInChat = async () => {
    try {
      const rides = await fetchActiveRidesForClustering();
      if (!rides.length) {
        setMessages(prev => [...prev, { from: 'bot', text: 'No active groups right now. Try posting a ride or searching a different time.' }]);
        return;
      }
      const clusters = clusterRides(rides, { maxGroupSize: 3, timeWindowMinutes: 15, algorithm: 'kmeans' });
      const formatted = formatClusterResults(clusters, { timeWindowMinutes: 15, proximityKm: 2 });
      setMessages(prev => [...prev, { from: 'bot', type: 'clusters', text: 'Here are current Ride Groups:', groups: formatted }]);
    } catch (e) {
      setMessages(prev => [...prev, { from: 'bot', text: e?.message || 'Unable to list clustering groups.' }]);
    }
  };

  const handleJoinClusterGroup = async (group) => {
    if (!auth?.currentUser) {
      setMessages(prev => [...prev, { from: 'bot', text: 'Please login to join a group.' }]);
      try { navigate('/login'); } catch {}
      return;
    }
    const userId = auth.currentUser.uid;
    const userNameHint = auth?.currentUser?.displayName || auth?.currentUser?.email || '';

    const candidate = Array.isArray(group?.rideOptions)
      ? group.rideOptions.find(o => (o.seatsRemaining || 0) > 0 && o.rideId)
      : null;

    try {
      if (candidate) {
        const res = await joinRideById(db, auth, { id: candidate.rideId, driverId: candidate.driverId, destination: group?.route?.split(' → ')[1] || '' }, userNameHint);
        setMessages(prev => [...prev, { from: 'bot', text: res.ok ? 'Joined this group successfully. Open Group Chat from Dashboard.' : (res.message || 'Could not join this group.') }]);
      } else {
        const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
        const [community, destination] = (group.route || '').split(' → ').map(s => (s || '').trim());
        const newRide = {
          driverId: null,
          driverName: 'Shared Ride',
          isShared: true,
          community: community || 'Community',
          destination: destination || 'Destination',
          date: group.date,
          time: group.time,
          vehicleType: group.vehicleType || 'car',
          seats: group.capacity || 3,
          price: group.estimatedCost || 0,
          status: 'Forming',
          passengers: [userId],
          createdAt: serverTimestamp(),
          createdBy: userId,
        };
        const created = await addDoc(collection(db, 'rides'), newRide);
        setMessages(prev => [...prev, { from: 'bot', text: 'You have successfully joined the group. Open Group Chat from Dashboard.', rideId: created.id }]);
      }
    } catch (e) {
      const msg = e?.code === 'permission-denied' ? 'You do not have permission to join this group.' : (e?.message || 'Could not join this group.');
      setMessages(prev => [...prev, { from: 'bot', text: msg }]);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    const userMsg = { from: 'user', text };
    setMessages(prev => [...prev, userMsg, { from: 'bot', text: 'Thinking…' }]);
    setInput('');
    setIsLoading(true);

    try {
      // If wizard active, capture answer and advance
      if (postWizard?.step) {
        const w = { ...(postWizard || {}) };
        const low = text.toLowerCase();
        if (w.step === 'dest') {
          w.dest = text;
          w.step = !w.date ? 'date' : (!w.time ? 'time' : (!w.seats ? 'seats' : (!w.price ? 'price' : 'done')));
        } else if (w.step === 'date') {
          if (low.includes('tomorrow')) {
            const now = new Date();
            const dt = new Date(now); dt.setDate(now.getDate() + 1);
            const y = dt.getFullYear(); const m = String(dt.getMonth() + 1).padStart(2, '0'); const d = String(dt.getDate()).padStart(2, '0');
            w.date = `${y}-${m}-${d}`;
          } else if (low.includes('today')) {
            const now = new Date();
            const y = now.getFullYear(); const m = String(now.getMonth() + 1).padStart(2, '0'); const d = String(now.getDate()).padStart(2, '0');
            w.date = `${y}-${m}-${d}`;
          } else {
            w.date = text;
          }
          w.step = !w.time ? 'time' : (!w.seats ? 'seats' : (!w.price ? 'price' : 'done'));
        } else if (w.step === 'time') {
          w.time = text;
          w.step = !w.seats ? 'seats' : (!w.price ? 'price' : 'done');
        } else if (w.step === 'seats') {
          const n = parseInt(text, 10); w.seats = Number.isFinite(n) ? n : 1;
          w.step = !w.price ? 'price' : 'done';
        } else if (w.step === 'price') {
          const n = parseInt(text.replace(/[^0-9]/g, ''), 10); w.price = Number.isFinite(n) ? n : 0;
          w.step = 'done';
        }
        if (w.step !== 'done') {
          setIsLoading(false);
          setPostWizard(w);
          const nextQ = w.step === 'date' ? 'What date? (YYYY-MM-DD or say today/tomorrow)' : w.step === 'time' ? 'What time? (e.g., 12:00 or 5 pm)' : w.step === 'seats' ? 'How many seats?' : 'What is the price (₹)?';
          setMessages(prev => {
            const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
            const resultMsg = { from: 'bot', text: nextQ };
            if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
            return [...prev, resultMsg];
          });
          return;
        }
        // finalize
        if (!auth?.currentUser) {
          setIsLoading(false);
          setPostWizard(null);
          setMessages(prev => {
            const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
            const resultMsg = { from: 'bot', text: 'Please log in first to post a ride. Go to Login or say: "login email: your@email.com password: yourPassword".' };
            if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
            return [...prev, resultMsg];
          });
          try { navigate('/login'); } catch {}
          return;
        }
        const built = `post ride to ${w.dest} on ${w.date} at ${w.time}, seats ${w.seats}, price ${w.price}`;
        const userNameHint = auth?.currentUser?.displayName || auth?.currentUser?.email || '';
        const res = await createRideFromPrompt(db, auth, built, userNameHint);
        setIsLoading(false);
        setPostWizard(null);
        setMessages(prev => {
          const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
          const resultMsg = res.ok
            ? { from: 'bot', text: `Ride posted to ${res.ride.destination} on ${res.ride.date} at ${res.ride.time}. Seats ${res.ride.seats}, price ₹${res.ride.price}.` }
            : { from: 'bot', text: `Could not post ride: ${res.message}` };
          if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
          return [...prev, resultMsg];
        });
        return;
      }
      // Local greeting handler
      const greet = greetingResponse(text);
      if (greet) {
        setIsLoading(false);
        setMessages(prev => {
          const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
          const resultMsg = { from: 'bot', text: greet };
          if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
          return [...prev, resultMsg];
        });
        return;
      }

      // Local "what is Colony Carpool" handler
      const colony = colonyCarpoolResponse(text);
      if (colony) {
        setIsLoading(false);
        setMessages(prev => {
          const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
          const resultMsg = { from: 'bot', text: colony };
          if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
          return [...prev, resultMsg];
        });
        return;
      }

      // Local login intent handler
      const login = parseLoginIntent(text);
      if (login) {
        if (login.email && login.password) {
          try {
            const userCred = await signInWithEmailAndPassword(auth, login.email, login.password);
            setIsLoading(false);
            setMessages(prev => {
              const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
              const resultMsg = { from: 'bot', text: `Logged in as ${userCred.user?.email || 'your account'}. Redirecting to Dashboard…` };
              if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
              return [...prev, resultMsg];
            });
            try { navigate('/dashboard'); } catch {}
          } catch (e) {
            setIsLoading(false);
            setMessages(prev => {
              const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
              const resultMsg = { from: 'bot', text: `Login failed: ${e?.message || 'Unable to sign in.'}` };
              if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
              return [...prev, resultMsg];
            });
          }
          return;
        } else {
          setIsLoading(false);
          setMessages(prev => {
            const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
            const resultMsg = { from: 'bot', text: 'To log in via chatbot, provide credentials like: "login email: your@email.com password: yourPassword".' };
            if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
            return [...prev, resultMsg];
          });
          return;
        }
      }

      // Local signup intent handler
      const signup = parseSignupIntent(text);
      if (signup) {
        if (signup.email && signup.password) {
          try {
            const userCred = await createUserWithEmailAndPassword(auth, signup.email, signup.password);
            setIsLoading(false);
            setMessages(prev => {
              const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
              const resultMsg = { from: 'bot', text: `Account created for ${userCred.user?.email || signup.email}. Redirecting to Dashboard…` };
              if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
              return [...prev, resultMsg];
            });
            try { navigate('/dashboard'); } catch {}
          } catch (e) {
            setIsLoading(false);
            setMessages(prev => {
              const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
              const resultMsg = { from: 'bot', text: `Signup failed: ${e?.message || 'Unable to create account.'}` };
              if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
              return [...prev, resultMsg];
            });
          }
          return;
        } else {
          setIsLoading(false);
          setMessages(prev => {
            const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
            const resultMsg = { from: 'bot', text: 'To sign up via chatbot, provide credentials like: "sign up email: your@email.com password: yourPassword".' };
            if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
            return [...prev, resultMsg];
          });
          return;
        }
      }

      // Local "how this website works" handler
      const how = siteHowResponse(text);
      if (how) {
        setIsLoading(false);
        setMessages(prev => {
          const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
          const resultMsg = { from: 'bot', text: how };
          if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
          return [...prev, resultMsg];
        });
        return;
      }

      // Local "how this website helps users" handler
      const helps = siteHelpResponse(text);
      if (helps) {
        setIsLoading(false);
        setMessages(prev => {
          const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
          const resultMsg = { from: 'bot', text: helps };
          if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
          return [...prev, resultMsg];
        });
        return;
      }

      // Local small-talk handler ("how are you")
      const small = smallTalkResponse(text);
      if (small) {
        setIsLoading(false);
        setMessages(prev => {
          const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
          const resultMsg = { from: 'bot', text: small };
          if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
          return [...prev, resultMsg];
        });
        return;
      }

      // User asks for clustering groups
      const lowClusters = text.toLowerCase();
      if (lowClusters.includes('cluster') || lowClusters.includes('ride groups') || lowClusters.includes('groups available') || lowClusters.includes('clustering groups')) {
        setIsLoading(false);
        setMessages(prev => {
          const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
          if (idx >= 0) { const next = [...prev]; next.splice(idx, 1); return next; }
          return prev;
        });
        await listClustersInChat();
        return;
      }

      // Try local NLP ride intent first
      const q = parseRideQuery(text);
      // Post ride intent (handled separately)
      if (/\b(post a ride|post ride|create ride|add ride)\b/i.test(text)) {
        if (!auth?.currentUser) {
          setIsLoading(false);
          setMessages(prev => {
            const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
            const resultMsg = { from: 'bot', text: 'Please log in first to post a ride. Tap Login or say: "login email: your@email.com password: yourPassword".' };
            if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
            return [...prev, resultMsg];
          });
          try { navigate('/login'); } catch {}
          return;
        }
        const userNameHint = auth?.currentUser?.displayName || auth?.currentUser?.email || '';
        const res = await createRideFromPrompt(db, auth, text, userNameHint);
        setIsLoading(false);
        setMessages(prev => {
          const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
          let resultMsg;
          if (res.ok) {
            const r = res.ride;
            resultMsg = {
              from: 'bot',
              text: `Ride posted to ${r.destination} on ${r.date} at ${r.time}. Seats ${r.seats}, price ₹${r.price}.`,
            };
          } else {
            // If missing fields, start a guided wizard
            if (String(res.message || '').toLowerCase().startsWith('missing ')) {
              const missing = String(res.message).replace(/^Missing /i, '');
              const w = { step: null, dest: null, date: null, time: null, seats: null, price: null };
              if (/destination/i.test(missing)) w.step = 'dest';
              else if (/date/i.test(missing)) w.step = 'date';
              else if (/time/i.test(missing)) w.step = 'time';
              else w.step = 'dest';
              setPostWizard(w);
              resultMsg = { from: 'bot', text: w.step === 'dest' ? 'What is the destination?' : w.step === 'date' ? 'What date? (YYYY-MM-DD or say today/tomorrow)' : 'What time? (e.g., 12:00 or 5 pm)' };
            } else {
              resultMsg = { from: 'bot', text: `Could not post ride: ${res.message}` };
            }
          }
          if (idx >= 0) { const next = [...prev]; next[idx] = resultMsg; return next; }
          return [...prev, resultMsg];
        });
        return;
      }
      if (q && (q.destination || (q.dateISO && q.time24))) {
        // If the intent is search-only, list results; if booking, auto-book best ride
        if (q.action === 'search') {
          const rides = await searchRidesByQuery(db, q);
          setIsLoading(false);
          setMessages(prev => {
            const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
            const summary = `Looking for rides${q.destination ? ` to ${q.destination}` : ''}${q.dateISO ? ` on ${q.dateISO}` : ''}${q.time24 ? ` around ${q.time24}` : ''}${q.minDriverRating ? ` with ${q.minDriverRating}★ drivers` : ''}.`;
            const resultMsg = rides.length > 0
              ? { from: 'bot', type: 'rides', text: summary, rides, q }
              : { from: 'bot', text: `${summary} No matching rides found. Try adjusting time or destination.` };
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = resultMsg;
              return next;
            }
            return [...prev, resultMsg];
          });
          return;
        } else {
          const userNameHint = auth?.currentUser?.displayName || auth?.currentUser?.email || '';
          const summary = `Booking a ride${q.destination ? ` to ${q.destination}` : ''}${q.dateISO ? ` on ${q.dateISO}` : ''}${q.time24 ? ` around ${q.time24}` : ''}${q.minDriverRating ? ` with ${q.minDriverRating}★ drivers` : ''}…`;
          const booking = await autoBookBestRide(db, auth, q, userNameHint);
          setIsLoading(false);
          setMessages(prev => {
            const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
            let resultMsg;
            if (booking.ok) {
              const r = booking.ride;
              resultMsg = {
                from: 'bot',
                type: 'booked-ride',
                text: `${summary} Done! You have been added to the ride to ${r.destination} on ${r.date} at ${r.time}.`,
                ride: r,
              };
            } else {
              resultMsg = { from: 'bot', text: `${summary} ${booking.message || 'Unable to book a ride.'}` };
            }
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = resultMsg;
              return next;
            }
            return [...prev, resultMsg];
          });
          return;
        }
      }

      // Fallback to LLM assistant
      const history = [...messages, userMsg];
      const { ok, answer, error } = await askLLM(text, history);
      setIsLoading(false);
      setMessages(prev => {
        const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
        const fallbackText = ok ? (answer || 'I\'m here to help!') : formatLLMFallback(text, error);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { from: 'bot', text: fallbackText };
          return next;
        }
        return [...prev, { from: 'bot', text: fallbackText }];
      });
    } catch (e) {
      setIsLoading(false);
      setMessages(prev => {
        const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
        const errMsg = { from: 'bot', text: `Oops, something went wrong while searching: ${e?.message || e}` };
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = errMsg;
          return next;
        }
        return [...prev, errMsg];
      });
    }
  };

  const quickAsk = async (text) => {
    if (isLoading) return;
    // Show saved searches handler
    const low = String(text || '').toLowerCase();
    if (low.includes('show saved searches') || low.includes('saved searches')) {
      const saved = loadSavedSearches();
      if (!saved.length) {
        setMessages(prev => [...prev, { from: 'user', text }, { from: 'bot', text: 'No saved searches yet. After a search, tap “Save this search”.' }]);
        return;
      }
      const lines = saved.slice(0, 5).map(s => `• ${s.destination || '(any)'}${s.dateISO ? ` on ${s.dateISO}` : ''}${s.time24 ? ` around ${s.time24}` : ''}${s.minDriverRating ? ` · ${s.minDriverRating}★+` : ''}`);
      setMessages(prev => [...prev, { from: 'user', text }, { from: 'bot', text: `Saved searches:\n${lines.join('\n')}` }]);
      return;
    }
    const canned = maybeHelpResponse(text);
    if (canned) {
      const userMsg = { from: 'user', text };
      setMessages(prev => [...prev, userMsg, { from: 'bot', text: canned }]);
      return;
    }
    const userMsg = { from: 'user', text };
    setMessages(prev => [...prev, userMsg, { from: 'bot', text: 'Thinking…' }]);
    setIsLoading(true);
    const history = [...messages, userMsg];
    const { ok, answer, error } = await askLLM(text, history);
    setIsLoading(false);
    setMessages(prev => {
      const idx = prev.findIndex(m => m.from === 'bot' && m.text === 'Thinking…');
      const fallbackText = ok ? (answer || 'Happy to help!') : formatLLMFallback(text, error);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { from: 'bot', text: fallbackText };
        return next;
      }
      return [...prev, { from: 'bot', text: fallbackText }];
    });
  };

  return (
    <div className={`floating-chat ${isOpen ? 'open' : ''}`}>
      {!isOpen && (
        <button className="floating-chat-toggle" onClick={() => setIsOpen(true)}>
          <FaComments />
        </button>
      )}

      {isOpen && (
        <div className={`floating-chat-window ${isMinimized ? 'minimized' : ''}`}>
          <div className="chat-header">
            <div className="chat-title"><FaRobot style={{ marginRight: 8 }} /> Help Assistant</div>
            <div className="chat-actions">
              <button className="chat-icon-btn" onClick={() => setIsMinimized(!isMinimized)} aria-label="Minimize">
                <FaMinus />
              </button>
              <button className="chat-icon-btn" onClick={() => setIsOpen(false)} aria-label="Close">
                <FaTimes />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              <div className="chat-body">
                {messages.map((m, idx) => (
                  <div key={idx} className={`chat-message ${m.from === 'user' ? 'user' : 'bot'}`}>
                    {m.type === 'rides' ? (
                      <div>
                        <div style={{ marginBottom: 8 }}>{m.text}</div>
                        {m.q && (
                          <div style={{ display:'flex', gap:8, margin:'8px 0' }}>
                            <button className="btn btn-primary" onClick={() => handleBookBestFromQuery(m.q)}>Book Best Match</button>
                            <button className="btn btn-secondary" onClick={() => {
                              const ok = saveSearch(m.q);
                              setMessages(prev => [...prev, { from: 'bot', text: ok ? 'Saved this search.' : 'Could not save this search.' }]);
                            }}>Save this search</button>
                          </div>
                        )}
                        {Array.isArray(m.rides) && m.rides.map((r) => {
                          const me = auth?.currentUser?.uid || null;
                          const joined = me ? (Array.isArray(r.passengers) && r.passengers.includes(me)) : false;
                          const isMine = me && r.driverId === me;
                          const seatsLeft = (r.seats || 1) - (Array.isArray(r.passengers) ? r.passengers.length : 0);
                          return (
                            <div key={r.id} className="ride-card" style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                                <div style={{ fontWeight: 600 }}>{r.destination}</div>
                                <div style={{ display:'flex', gap:6 }}>
                                  {isMine && (<span style={{ fontSize:12, color:'#2563eb', border:'1px solid #93c5fd', padding:'2px 6px', borderRadius:6 }}>Your ride</span>)}
                                  {joined && !isMine && (<span style={{ fontSize:12, color:'#16a34a', border:'1px solid #86efac', padding:'2px 6px', borderRadius:6 }}>Joined</span>)}
                                </div>
                              </div>
                              <div>Date: {r.date} · Time: {r.time}</div>
                              <div>Driver: {r.driverName}{r.driverAverageRating != null ? ` · ${r.driverAverageRating.toFixed(1)}★` : ''}</div>
                              <div>Seats left: {seatsLeft}</div>
                              <div>Price: ₹{Number(r.price || 0)}</div>
                              {m.q && (
                                <div style={{ color:'#6b7280', fontSize:12, marginTop:4 }}>
                                  {explainMatch(r, m.q)}
                                </div>
                              )}
                              <div style={{ display:'flex', gap:8, marginTop:8 }}>
                                <button className="btn btn-primary" onClick={() => handleAccept(r)} disabled={joined || isMine}>{joined ? 'Already Joined' : (isMine ? 'Owner' : 'Accept')}</button>
                                <button className="btn btn-secondary" onClick={() => handlePrivateChat(r)}>{joined || isMine ? 'Open Private Chat' : 'Private Chat'}</button>
                                <button className="btn" onClick={() => downloadICS(r)}>Add to Calendar</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : m.type === 'clusters' ? (
                      <div>
                        <div style={{ marginBottom: 8 }}>{m.text}</div>
                        {Array.isArray(m.groups) && m.groups.map((g) => (
                          <div key={`grp-${g.groupId}`} className="ride-card" style={{ border: '1px solid #ddd', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                            <div style={{ fontWeight: 600 }}>{g.route}</div>
                            <div>Date: {g.date} · Time: {g.time} · {g.vehicleLabel}</div>
                            <div>Members: {g.members} · Seats left: {g.remainingSeats} · CO₂ saved ~{g.co2SavingPct}%</div>
                            <div>Cost/person: ₹{Number(g.costPerPerson || 0).toFixed(0)}</div>
                            <div style={{ color:'#6b7280', fontSize:12, marginTop:4 }}>
                              {g.explanations?.counterfactual || ''}
                            </div>
                            <div style={{ display:'flex', gap:8, marginTop:8 }}>
                              <button className="btn btn-primary" onClick={() => handleJoinClusterGroup(g)}>Accept</button>
                              {g.rideOptions?.[0]?.driverId && (
                                <button className="btn btn-secondary" onClick={() => handlePrivateChat({ id: g.rideOptions[0].rideId, driverId: g.rideOptions[0].driverId, destination: g.route.split(' → ')[1] })}>Private Chat</button>
                              )}
                              <button className="btn" onClick={() => downloadICS({ id: `grp-${g.groupId}`, destination: g.route.split(' → ')[1], date: g.date, time: g.time, driverName: g.rideOptions?.[0]?.driverName || 'Shared', price: g.costPerPerson })}>Add to Calendar</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : m.type === 'booked-ride' ? (
                      <div>
                        <div style={{ marginBottom: 8 }}>{m.text}</div>
                        {m.ride && (
                          <div className="ride-card" style={{ border: '1px solid #4ade80', background:'#ecfdf5', borderRadius: 8, padding: 10, marginBottom: 8 }}>
                            <div style={{ fontWeight: 700 }}>Booked Ride</div>
                            <div>Destination: {m.ride.destination}</div>
                            <div>Date: {m.ride.date} · Time: {m.ride.time}</div>
                            <div>Driver: {m.ride.driverName}</div>
                            <div>Price: ₹{Number(m.ride.price || 0)}</div>
                            <div style={{ display:'flex', gap:8, marginTop:8 }}>
                              <button className="btn" onClick={() => downloadICS(m.ride)}>Add to Calendar</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      m.text
                    )}
                  </div>
                ))}
              </div>

              <div className="chat-quick">
                <span>Quick help:</span>
                <button onClick={() => quickAsk('Cannot login')}>Login</button>
                <button onClick={() => quickAsk('How to join a ride?')}>Join ride</button>
                <button onClick={() => quickAsk('Notifications not showing')}>Notifications</button>
                <button onClick={() => quickAsk('Map not loading')}>Map</button>
                <button onClick={() => quickAsk('I need human help')}>Need human</button>
                <button onClick={() => quickAsk('Payment or savings incorrect')}>Payment</button>
                <button onClick={() => quickAsk('Cannot find a ride')}>Find ride</button>
                <button onClick={() => quickAsk('Change my destination or time')}>Change ride</button>
                <button onClick={() => quickAsk('How to post a ride?')}>Post ride</button>
                <button onClick={() => quickAsk('Contact driver or passenger')}>Contact driver</button>
                <button onClick={() => quickAsk('How this website works')}>How it works</button>
                <button onClick={() => quickAsk('What is Colony Carpool')}>What is Colony Carpool</button>
                <button onClick={() => quickAsk('Show saved searches')}>Saved searches</button>
              </div>

              <div className="chat-input">
                <input
                  type="text"
                  placeholder="Type your question..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' ? send() : null}
                />
                <button onClick={send} aria-label="Send" disabled={isLoading}>
                  <FaPaperPlane />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FloatingChatbot;
