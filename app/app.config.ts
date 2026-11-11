export default defineAppConfig({
  // The bell (base layer components/user_events.vue): automation events are shown on the dashboard (each
  // automation's card and events); the bell only says how many automations have problems (deleted in their events).
  userEvents: {
    excludeCategories: ['automation'],
    summaries: [
      { category: 'automation', message: 'events.summary.automation', to: '/dashboard' },
    ],
  },
})
