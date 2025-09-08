import { SignUp } from '@clerk/remix';

export default function SignUpPage() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <SignUp routing="path" path="/sign-up" />
    </div>
  );
}
