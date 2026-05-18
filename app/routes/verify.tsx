import { useState } from "react";
import { Link, useNavigate } from "react-router";

export default function VerifyEmail() {
    const [token, setToken] = useState("");
    const [status, setStatus] = useState<"idle" | "verifying" | "success" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState("");
    const navigate = useNavigate();

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus("verifying");
        try {
            const res = await fetch("http://localhost:8080/auth/verify", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token })
            });

            if (res.ok) {
                setStatus("success");
                setTimeout(() => navigate("/login"), 2000);
            } else {
                setStatus("error");
                setErrorMsg("Invalid or expired token.");
            }
        } catch (error) {
            setStatus("error");
            setErrorMsg("Network error. Please try again.");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
                        Verify your email
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
                        Please enter the verification token sent to your email address.
                    </p>
                </div>
                
                {status === "success" ? (
                    <div className="rounded-md bg-green-50 p-4">
                        <div className="flex">
                            <div className="ml-3">
                                <h3 className="text-sm font-medium text-green-800">Verification successful!</h3>
                                <div className="mt-2 text-sm text-green-700">
                                    <p>Redirecting to login...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <form className="mt-8 space-y-6" onSubmit={handleVerify}>
                        <div>
                            <label htmlFor="token" className="sr-only">Verification Token</label>
                            <input
                                id="token"
                                name="token"
                                type="text"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-700 rounded-t-md rounded-b-md focus:outline-none focus:ring-green-500 focus:border-green-500 focus:z-10 sm:text-sm"
                                placeholder="Verification Token"
                                value={token}
                                onChange={(e) => setToken(e.target.value)}
                            />
                        </div>

                        {status === "error" && (
                            <div className="text-red-500 text-sm text-center">
                                {errorMsg}
                            </div>
                        )}

                        <div>
                            <button
                                type="submit"
                                disabled={status === "verifying"}
                                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                            >
                                {status === "verifying" ? "Verifying..." : "Verify Email"}
                            </button>
                        </div>
                        
                        <div className="text-center">
                            <Link to="/login" className="font-medium text-green-600 hover:text-green-500 text-sm">
                                Back to login
                            </Link>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
