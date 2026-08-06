I want to use Google Platform Cloud free tier to create badminton club management app or website.
Give me your suggested architecture.
Requirements:
- Efficient use of resources and products to ensure that I don't exceed the free tier (https://docs.cloud.google.com/free/docs/free-cloud-features#free-tier-usage-limits).
- Mobile friendly
- Needs to be able to easily accomodate adding new features such as recording matches
- Pages:
    - Home page: 
        - IF not signed in: information about the club and CTA to sign up and sign in option.
        - IF signed in: Page where they can see available sessions and their nickname and photo and have the options to update this info. Session information includes the following information:
        - Who has signed up
        - How many slots are available
        - Day and time
        - Location
    - Ranking page (only accessible to signed in users): Lets you rate the badminton skill level of every player and also shows the ranking of each player along with their nickname and photo if available. Available ranking options are 1 to 5 stars (selectable). Ranking also show how many people have rated each player.
    - Admin page (only accessible to users with "admin" role):
        - Can see all registered users and assign "admin" role. Default role is "member"
        - Can manage sessions (add, update, delete, remove users from a session).
- User sign up and login with SSO (Google) or username/password. When user signs up, they must choose a nickname and optionally upload their picture.
- Types of users:
    - "member" who can:
        - register for sessions
        - view ranked leaderboard 
    - "admin" who can do what a user does and also access the Admin page

- additional feature in session:
    add the cost of the session and optionally override the number of players that played. Then show each user how much they need to pay (we can discuss the best place to show that)


    Questions: how often do we refresh the leaderboard? If we reduce the refresh, can we save significant resources?

    

