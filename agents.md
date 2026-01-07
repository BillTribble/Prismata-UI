Coding Guidelines 
Iterative Development: Build one component at a time. Verify often.
No Dead Code: If you write a helper function, use it or delete it.
Visual Verification: UI must look "Glassy" and premium. Use backdrop-blur-md and border-white/10 heavily.
Error Handling: APIs fail. Always wrap fetch calls in try/catch.
Keep It Simple (KISS): Prefer simple, readable code over clever abstractions.
Don't Repeat Yourself (DRY): Extract reusable logic into hooks or utility files.
Modularity:
Avoid "God Files". If a file exceeds 200 lines, break it down.
Separate Logic (hooks/) from UI (components/).
One component per file.