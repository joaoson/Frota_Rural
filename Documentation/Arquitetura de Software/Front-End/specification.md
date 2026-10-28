Folder structure:

/src
    /app
    - /routes
    - app.tsx
    - router.tsx
    /features
    - /<feature> (for each <feature> mention, replace with a word that relates to the feature being implemented)
        - /components
        - /api
            - <feature>Client.tsx (if needed to create a file for client abstraction, don't think it will in most cases)
            - <feature>Repository.tsx (this file includes interface and implementation)
            - <feature>Store.tsx
        - /types
        - /hooks
    /shared
    - /components
    - /utils
    - /types
    - /hooks
    - /http
        - TanStack Query abstraction follo
    - /lib
    /config
    /assets
    /tests

The idea of this architecture is to create views that communicate like this, bidirectionaly: view <-> hook <-> store <-> repository <-> client

In /shared, /http should contain client abstractions that follow SOLID principle. This can inject orval or tanstack, whatever works best and is more professional and follow good architectures instructions.

Another thing: repositories might benefit from receiving client via their constructor, in a way that we can be sure they all use the same instance of HTTP client. This could be done in a composition root for the app, maybe a container.tsx file in which we can instantiate our stores and later, on the actual pages or components, get them from in memory. For this, an important reminder is for stores to have clear() methods, that can be called in logout or deinits.