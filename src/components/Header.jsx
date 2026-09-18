"use client";

import { DownArrowIcon, DropDownNotificationIcon, LogoutICon, LogOutModalIcon, MyProfileIcon, NotificationIcon } from "@/utils/Icons";
import React, { useState, useEffect } from "react";
import { Dropdown, Modal } from "antd";
import Cookies from "js-cookie";
import { useRouter } from "next/navigation";
import { getNameInitials } from "@/utils/commonFunction";
import { toast } from "react-toastify";
import { createClient } from "@/utils/supabase/client";

const Header = () => {
    const supabase = createClient();
    const [logOutModal, setLogOutModal] = useState(false);
    const [user, setUser] = useState(null);
    const router = useRouter();

    useEffect(() => {
        const fetchUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUser(user);
            }
        };

        fetchUser();

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => {
            authListener?.subscription?.unsubscribe();
        };
    }, []);

    const userDetails = {
        name: user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User",
        profileImage: user?.user_metadata?.avatar_url || null,
    };

    const menuItems = [
        {
            key: "profile",
            label: (
                <div className="flex items-center gap-[6px] text-[14px] font-[400] p-[12px] rounded-[8px] hover:bg-primary hover:text-white transition-all">
                    <MyProfileIcon />
                    <span>My Profile</span>
                </div>
            ),
        },
        {
            key: "notification-setting",
            label: (
                <div
                    onClick={() => router.push("/notification-settings")}
                    className="flex items-center gap-[6px] text-[14px] font-[400] p-[12px] rounded-[8px] hover:bg-primary hover:text-white transition-all"
                >
                    <DropDownNotificationIcon />
                    <span>Notification Setting</span>
                </div>
            ),
        },
        {
            key: "logout",
            label: (
                <div className="flex items-center gap-[6px] text-[14px] font-[400] text-[#FF4D4F] p-[12px] rounded-[8px] hover:bg-[#FF4D4F] hover:text-white transition-all">
                    <LogoutICon />
                    <span>Log Out</span>
                </div>
            ),
            onClick: () => {
                setLogOutModal(true);
            },
        },
    ];

    const handleLogOut = async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) {
                toast.error(error.message || "Logout failed");
                return;
            }
            Cookies.remove("token"); 
            setLogOutModal(false);
            toast.success("Logged out successfully!");
            router.replace("/login");
            router.refresh();
        } catch (error) {
            console.log(error);
            toast.error("Logout failed");
        }
    };

    return (
        <div className="w-full text-black bg-white flex items-center justify-between py-[10px] px-[24px] fixed top-0 left-0 z-50">
            <div className="flex justify-between items-center w-full">
                <div className="sm:text-[32px] text-[24px] font-[700] capitalize">
                    Auto DM
                </div>

                <div className="flex items-center justify-center gap-[12px]">
                    <Dropdown
                        prefixCls="custom-dropdown-header"
                        menu={{ items: menuItems }}
                        trigger={["click"]}
                        placement="bottomRight"
                    >
                        <button className="flex gap-[10px] border-[1px] border-[#C8C8C8] items-center px-[8px] py-[6px] justify-center rounded-full bg-white cursor-pointer">
                            <div className="h-8 w-8 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm uppercase shrink-0">
                                {getNameInitials(userDetails?.name)}
                            </div>

                            <div className="text-[16px] font-[500] capitalize">{userDetails?.name}</div>
                            <span><DownArrowIcon /></span>
                        </button>
                    </Dropdown>
                  
                    <div
                        className="h-[40px] w-[40px] bg-[#E3E3E3] rounded-full flex items-center justify-center cursor-pointer"
                    >
                        <NotificationIcon />
                    </div>
                </div>
            </div>
            {logOutModal && (
                <Modal
                    open={logOutModal}
                    centered
                    width={448}
                    footer={false}
                    closable={false}
                    onCancel={() => setLogOutModal(false)}
                >
                    <div className="flex flex-col w-full items-center gap-4">
                        <div>
                            <LogOutModalIcon />
                        </div>

                        <p className="font-bold text-[24px] leading-[120%] text-center text-black">
                            Log Out
                        </p>
                        <p className="text-[#696969]">
                            Are you sure you want to logout this account?
                        </p>

                        <div className="w-full flex items-center justify-center gap-4 mt-6">
                            <button
                                onClick={() => setLogOutModal(false)}
                                className="w-full h-11 bg-white border rounded-[10px] text-sm font-medium cursor-pointer"
                            >
                                No
                            </button>
                            <button
                                onClick={handleLogOut}
                                className="h-11 w-full rounded-[10px] text-sm font-medium text-white cursor-pointer bg-[#FB4A49]"
                            >
                                Yes
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

export default Header;
