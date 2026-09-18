"use client";

import React from "react";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import { ToastContainer } from "react-toastify";
import { store, persistor } from "@/redux/store";
import "react-toastify/dist/ReactToastify.css";

export default function Providers({ children }) {
    return (
        <>
            <ToastContainer
                position="top-right"
                autoClose={3000}
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
            />{" "}
            <Provider store={store}>
                <PersistGate
                    loading={<p className="h-[100vh] w-full flex items-center justify-center">Loading...</p>}
                    persistor={persistor}
                >
                    {children}
                </PersistGate>
            </Provider>
        </>
    );
}
