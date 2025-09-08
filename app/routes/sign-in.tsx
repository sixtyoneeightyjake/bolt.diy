import { SignIn } from '@clerk/remix';

export default function SignInPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <SignIn routing="path" path="/sign-in" />
    </div>
  );
}
