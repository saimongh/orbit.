# orbit.

**orbit.** is a personal relationship manager (PRM) designed to help you maintain meaningful connections with the people in your life. It moves beyond static contact lists to track interactions, history, and the natural "drift" of relationships over time.

## why i made it.

Traditional contact apps are digital phonebooks; they store data but ignore context. Social media is too noisy and performative. Corporate CRMs are too rigid and sales-focused.

I needed a tool that felt personal. I wanted to answer simple but vital questions:

- When did I last speak to my brother?
- Who have I not connected with in a while?
- How do my friends know each other?

**orbit.** was built to visualize these connections and provide a gentle system to prevent important relationships from drifting away.

## features.

### 1. drift tracking

The core of the system. You can assign a "Catch Up Frequency" (e.g., Every Month) to any contact. If you haven’t logged an interaction within that window, the contact is flagged as **Drifting**.

### 2. context-aware history

Log interactions with specific contexts (In-person, Text, Call, Video). The system calculates the "Last Spoken" date automatically based on these logs.

### 3. connection mapping

Create links between contacts. You can specify that "Alice" is the "Sister" of "Bob." These connections appear on the contact cards, creating a web of relationships.

### 4. recursive events

Track birthdays and anniversaries. The system calculates the current count (e.g., "30th Birthday") and ignores the year when sorting by "Upcoming" to ensure annual events always float to the top when relevant.

### 5. smart sorting

Cycle through three views to manage your network:

- **Manual:** Your custom drag-and-drop order.
- **Upcoming:** Shows only contacts with events in the next 30 days.
- **Needs Contact:** Prioritizes contacts based on their "Drift" score (who is most overdue).

## how it works.

**orbit.** runs entirely in the browser. It is built with:

- **HTML5**
- **CSS3** (Custom variables for robust theming)
- **Vanilla JavaScript** (ES6+)

**Privacy First:** There is no database and no cloud server. All data is stored in your browser's `localStorage`. You own your data completely. You can export it to a JSON file at any time for backup.

## how to use.

1.  **Add a Contact:** Press `N` or click the `+` button to create a new card.
2.  **Define the Orbit:** Set a "Catch Up Frequency" (e.g., Every 3 Months).
3.  **Log History:** Click the small `+` icon on a contact card to "Quick Log" an interaction. This resets their drift status.
4.  **Add Details:** Click a card to enter their orbit. Here you can add specific details like **Events**, **Connections**, **Interests**, or **Notes**.
5.  **Stay Updated:** Use the sort button in the sidebar to toggle to "Needs Contact" to see who you should reach out to next.

## setup.

No installation required.

1.  Clone the repository.
2.  Open `index.html` in any web browser.
3.  Alternatively, host it via GitHub Pages for mobile access.
