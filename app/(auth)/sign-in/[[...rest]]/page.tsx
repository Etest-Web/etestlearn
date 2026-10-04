import { SignIn } from "@clerk/nextjs";

const SigninPage = () => {
    return (
        /* py-* + min-h-dvh rather than h-screen: this stacks under the sticky
           Navbar, so a full 100vh block always pushed the card past the fold
           (and iOS 100vh already exceeds the visible viewport). */
        <main className="flex min-h-dvh items-center justify-center px-4 py-10">
            <div className="flex w-full flex-col items-center justify-center">
                {/* Display face on the h1 — the same voice every other page
                    title uses. PageHeader is not used here because it is
                    left-aligned on desktop, and an auth screen reads better
                    centred. */}
                <h1 className="display-heading mb-4 text-center text-3xl text-balance sm:text-5xl">
                    Welcome to Glypha Learning
                </h1>
                {/* The tagline was already in the display face; `tracking-wide`
                    kept rather than `tracking-editorial` because the looser
                    editorial tracking is for short uppercase labels, not a
                    sentence. */}
                <p className="mb-8 text-center font-display text-lg tracking-wide text-muted-foreground sm:text-2xl">
                    Creating the Best in the World...
                </p>
                <SignIn />
            </div>
        </main>
    );
};

export default SigninPage;
