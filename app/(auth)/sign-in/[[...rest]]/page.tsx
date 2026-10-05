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
                {/* The tagline stays in the display face but not at heading
                    weight or scale — it is a sentence, so it takes the
                    display face's tight tracking at medium weight instead of
                    the loose tracking a short uppercase label would want. */}
                <p className="mb-8 text-center font-display text-lg font-medium tracking-display text-muted-foreground sm:text-2xl">
                    Creating the Best in the World...
                </p>
                <SignIn />
            </div>
        </main>
    );
};

export default SigninPage;
