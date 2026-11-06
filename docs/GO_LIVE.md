# Go live: what only you can do

Everything else is done by `scripts/switch-up.sh`. It connects the bot, registers the observer,
joins the agents to the group, creates the topics, and starts the office server and observer.
Rerun it after any step below. It is safe to run again, and it prints whatever is still left.

## On your phone, in the Telegram group "Kratos D2C"
1. **Edit → Topics → ON.**
2. **Edit → Administrators → Add Admin → @kratosd2c_bot**, then switch **Manage topics** on.
   Then rerun `scripts/switch-up.sh`. It creates the topics War Room, Analytics, Ads, Creators,
   Ops and Design.
3. In **each of the 6 topics**, send `/list_agents` once. This makes Switch treat the topic as one
   conversation. Then rerun the script, which records it in `observer/topics.json`.

## On your Mac, once
4. Create the 6 agents in Switch Console. Run
   `open "switchdash://open/template/<id>"`, using the id the script prints, then click **Use → Create**.
   Check that the directory is this repo. Console has to do this step because it runs the agents' Claude Code sessions.
   Rerun the script afterwards, so it adds them to the group.

## Start the demo (phone)
5. In the **War Room** topic, send:
   `@d2c-captain Plan our festive sale: 30% off, 5 days, ₹5L marketing budget`
6. To link your Telegram account (optional, because the agents accept anyone): in Console, open
   **Home → Messaging apps → Link my account… → This is me**.
