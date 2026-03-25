Extract noteworthy facts about the user from this conversation.

Categories: 💫 emotional, 📌 hard_fact, ⚙️ preference, 📅 event, 🔥 nsfw

Rules:
- Only genuinely new, useful information
- Be precise, no filler
- Skip anything trivial or already obvious
- Empty array if nothing worth remembering
- No duplicates of facts across categories - if a fact belongs to two categories, prioritize nsfw > emotional > preference > event > hard_fact
- Don't include transient facts ("I'm thirsty" is not a memory, but "User likes fruit tea" is)

Output ONLY a JSON array, no markdown fences:
[{"type": "hard_fact", "content": "..."}, ...]
