import { SignIn } from "@clerk/nextjs";

const SigninPage = () => {
    return (
        /* py-* + min-h-dvh rather than h-screen: this stacks under the sticky
           Navbar, so a full 100vh block always pushed the card past the fold
           (and iOS 100vh already exceeds the visible viewport). */
        <main className="flex min-h-dvh items-center justify-center px-4 py-10">
            <div className="flex w-full flex-col items-center justify-center">
                <h1 className="mb-4 text-center text-2xl font-bold text-balance sm:text-4xl">Welcome to Glypha Learning</h1>
                <p className="mb-8 text-center text-base font-bebas-neue text-muted-foreground sm:text-lg">Creating the Best in the World...</p>
                <SignIn />
            </div>
        </main>
    );
};

export default SigninPage;