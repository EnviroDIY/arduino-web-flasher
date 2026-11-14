import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { TextDecoder } from "util";
import App from "./App";

jest.mock("avrgirl-arduino", () => jest.fn());

describe("serial monitor", () => {
  let finishRead;
  let port;

  beforeEach(() => {
    global.TextDecoder = TextDecoder;

    const reader = {
      cancel: jest.fn(() => {
        finishRead({ done: true });
        return Promise.resolve();
      }),
      read: jest.fn()
        .mockResolvedValueOnce({ value: Uint8Array.from([104, 101, 108, 108, 111, 10]), done: false })
        .mockImplementation(() => new Promise(resolve => { finishRead = resolve; })),
      releaseLock: jest.fn()
    };

    port = {
      close: jest.fn(() => Promise.resolve()),
      open: jest.fn(() => Promise.resolve()),
      readable: { getReader: () => reader },
      writable: {}
    };

    Object.defineProperty(navigator, "serial", {
      configurable: true,
      value: { requestPort: jest.fn(() => Promise.resolve(port)) }
    });
  });

  it("connects, displays serial output, and disconnects cleanly", async () => {
    render(<App />);

    fireEvent.click(screen.getByText("Connect"));

    expect(await screen.findByText("Connected")).toBeInTheDocument();
    expect(port.open).toHaveBeenCalledWith({ baudRate: 115200 });
    expect(await screen.findByText(/hello/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Disconnect"));

    expect(await screen.findByText("Disconnected")).toBeInTheDocument();
    expect(port.close).toHaveBeenCalledTimes(1);
  });
});
