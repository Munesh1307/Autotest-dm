import { SyncOutlined } from "@ant-design/icons";
import { Spin } from "antd";
import React, { useEffect, useState } from "react";

const loadingMessages = [
  "Fetching data, please wait...",
  "Processing your request, almost done!",
  "Loading, thank you for your patience.",
  "Preparing your data, almost ready!",
  "Processing data, thank you for waiting.",
  "Request in progress, please hold on.",
];

const Loader = ({
  height,
  size,
  color,
  onlySpinner = false,
}) => {
  const antIcon = (
    <SyncOutlined
      style={{ fontSize: size || 46, color: color || "#d80c0c" }}
      spin
    />
  );

  const [message, setMessage] = useState("");

  useEffect(() => {
    const randomMessage =
      loadingMessages[Math.floor(Math.random() * loadingMessages?.length)];
    setMessage(randomMessage);
  }, []);

  return (
    <div
      className={`w-full ${height ? `h-[${height}]` : "h-full"} flex flex-col items-center justify-center gap-2 py-12`}
    >
      <Spin className="m-0" indicator={antIcon} />
      {!onlySpinner && (
        <p className="text-base lg:text-lg text-center relative overflow-hidden bg-clip-text ">
          {message}
        </p>
      )}
    </div>
  );
};

export default Loader;
