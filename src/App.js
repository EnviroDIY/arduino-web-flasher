import React, { useState, useRef, useEffect } from "react";
import AvrgirlArduino from "avrgirl-arduino";

function App() {
  const monitorBaudRates = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
  const maxMonitorCharacters = 100000;
  const boardChoices = [ //Testing values: working | notTested | notWorking
    { name: "EnviroDIY Mayfly", value: "mayfly", tested: true },
    { name: "Arduino Uno", value: "uno", tested: false },
    { name: "Arduino Mega", value: "mega", tested: false },
    { name: "Arduino ADK", value: "adk", tested: false },
    { name: "Arduino Nano", value: "nano", tested: true },
    { name: "Arduino Nano (with new bootloader)", value: "nano (new bootloader)", tested: false },
    { name: "Arduino Lilypad USB", value: "lilypad-usb", tested: false },
    { name: "Arduino Yun", value: "yun", tested: false },
    { name: "Arduino Esplora", value: "esplora", tested: false },
    { name: "Tiny Circuits Tinyduino", value: "tinyduino", tested: false },
    { name: "SparkFun Pro Micro	", value: "sf-pro-micro", tested: false },
    { name: "Qtechknow Qduino", value: "qduino", tested: false },
    { name: "Pinoccio Scout", value: "pinoccio", tested: false },
    { name: "Femtoduino IMUduino", value: "imuduino", tested: false },
    { name: "Adafruit Feather 32u4 Basic Proto", value: "feather", tested: false },
    { name: "Adafruit Circuit Playground", value: "circuit-playground-classic", tested: false },
    { name: "BQ ZUM", value: "bqZum", tested: false },
    { name: "BQ ZUM Core 2", value: "zumcore2", tested: false },
    { name: "BQ ZUM Junior	", value: "zumjunior", tested: false },

  ];

  const fileInput = useRef(null);
  const selectedFile = useRef(null);
  const monitorPort = useRef(null);
  const monitorReader = useRef(null);
  const monitorReadLoop = useRef(null);
  const monitorDisconnectRequested = useRef(false);
  const monitorOutputElement = useRef(null);
  const [board, updateBoard] = useState(boardChoices[0].value);
  const [fileName, updateFileName] = useState("");
  const [uploadStatus, updateUploadStatus] = useState("");
  const [uploadStatusTitle, updateUploadStatusTitle] = useState("");
  const [uploadStatusMsg, updateUploadStatusMsg] = useState("");
  const [browserSupported, updateBrowserSupported] = useState(true);
  const [infoBoardSelectHover, setInfoBoardSelectHover] = useState(false);
  const [monitorBaudRate, setMonitorBaudRate] = useState(115200);
  const [monitorStatus, setMonitorStatus] = useState("disconnected");
  const [monitorOutput, setMonitorOutput] = useState("");
  const [monitorError, setMonitorError] = useState("");



  useEffect(() => {
    updateBrowserSupported('serial' in navigator);
  }, []);

  useEffect(() => {
    if (monitorOutputElement.current) {
      monitorOutputElement.current.scrollTop = monitorOutputElement.current.scrollHeight;
    }
  }, [monitorOutput]);

  useEffect(() => () => {
    monitorDisconnectRequested.current = true;
    if (monitorReader.current) {
      monitorReader.current.cancel().catch(() => {});
    } else if (monitorPort.current) {
      monitorPort.current.close().catch(() => {});
    }
  }, []);



  const showUploadError = error => {
    updateUploadStatus("error");
    updateUploadStatusTitle("Error Flashing Arduino!");
    updateUploadStatusMsg(error instanceof Error ? error.message : String(error));
  };

  const appendMonitorOutput = text => {
    if (!text) return;

    setMonitorOutput(output => (output + text).slice(-maxMonitorCharacters));
  };

  const readSerialOutput = async (port, reader) => {
    const decoder = new TextDecoder();

    try {
      while (!monitorDisconnectRequested.current) {
        const { value, done } = await reader.read();
        if (done) break;
        appendMonitorOutput(decoder.decode(value, { stream: true }));
      }
      appendMonitorOutput(decoder.decode());
    } catch (error) {
      if (!monitorDisconnectRequested.current) {
        setMonitorError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      try {
        reader.releaseLock();
      } catch (error) {
        console.warn("Could not release the serial monitor reader.", error);
      }

      if (monitorReader.current === reader) monitorReader.current = null;

      try {
        await port.close();
      } catch (error) {
        if (!monitorDisconnectRequested.current) {
          setMonitorError(error instanceof Error ? error.message : String(error));
        }
      }

      if (monitorPort.current === port) monitorPort.current = null;
      setMonitorStatus("disconnected");
    }
  };

  const connectSerialMonitor = async () => {
    if (monitorStatus !== "disconnected") return;

    setMonitorStatus("connecting");
    setMonitorError("");
    monitorDisconnectRequested.current = false;

    let port;
    try {
      port = await navigator.serial.requestPort();
      await port.open({ baudRate: Number(monitorBaudRate) });

      const reader = port.readable.getReader();
      monitorPort.current = port;
      monitorReader.current = reader;
      setMonitorStatus("connected");
      monitorReadLoop.current = readSerialOutput(port, reader);
    } catch (error) {
      if (port && (port.readable || port.writable)) {
        try {
          await port.close();
        } catch (closeError) {
          console.warn("Could not close the serial monitor port.", closeError);
        }
      }
      setMonitorStatus("disconnected");
      setMonitorError(error instanceof Error ? error.message : String(error));
    }
  };

  const disconnectSerialMonitor = async () => {
    if (monitorStatus === "disconnected") return;

    monitorDisconnectRequested.current = true;
    setMonitorStatus("disconnecting");
    setMonitorError("");

    try {
      if (monitorReader.current) await monitorReader.current.cancel();
      if (monitorReadLoop.current) await monitorReadLoop.current;
    } catch (error) {
      setMonitorError(error instanceof Error ? error.message : String(error));
      setMonitorStatus("disconnected");
    } finally {
      monitorReadLoop.current = null;
    }
  };

  const openSerialMonitor = async () => {
    clearStatus();
    await connectSerialMonitor();
  };



  const handleSubmit = async e => {
    e.preventDefault();

    if (monitorStatus !== "disconnected") {
      await disconnectSerialMonitor();
    }

    updateUploadStatus("flashing");
    updateUploadStatusTitle("Flashing Arduino...");
    updateUploadStatusMsg("");


    const reader = new FileReader();

    reader.onload = event => {
      const filecontents = event.target.result;

      try {
        const avrgirl = new AvrgirlArduino({
          board: board,
          debug: true
        });

        avrgirl.flash(filecontents, error => {
          if (error) {
            showUploadError(error);

          } else {
            console.info("flash successful");
            updateUploadStatus("done");
            updateUploadStatusTitle("Flash Successful!");
            updateUploadStatusMsg("Successfully flashed the Arduino! Open the serial monitor to view output from the new program.");
          }
        });
      } catch (error) {
        showUploadError(error);
      }
    };

    reader.onerror = () => showUploadError(reader.error || new Error("Could not read the selected file."));

    try {
      reader.readAsArrayBuffer(selectedFile.current);
    } catch (error) {
      showUploadError(error);
    }
  };

  const clearStatus = () => {
    updateUploadStatus("");
    updateUploadStatusTitle("");
    updateUploadStatusMsg("");
  };

  const clearFileInput = () => {
    updateFileName("");
    selectedFile.current = null;
    if (fileInput) fileInput.current.value = null;
  };

  const selectFile = file => {
    if (!file) return;

    selectedFile.current = file;
    updateFileName(file.name);
  };

  const handleFileDrop = event => {
    event.preventDefault();
    selectFile(event.dataTransfer.files[0]);
  };

  const BoardOptions = boardChoices.map((board, i) => <option value={board.value} key={i}>{board.name} {board.tested ? '✅' : ''}</option>);


  const monitorStatusLabel = {
    connected: "Connected",
    connecting: "Connecting...",
    disconnected: "Disconnected",
    disconnecting: "Disconnecting..."
  }[monitorStatus];

  return (
    <div className="w-full min-h-screen bg-gray-900 flex flex-col">
      {!browserSupported && <div className="w-screen h-screen bg-opacity-90 fixed bg-gray-900 z-20 flex flex-col gap-2 justify-center items-center text-white text-lg text-center">
        <h2 className="text-white text-4xl mb-6 font-bold">Browser is not supported😥</h2>
        <p>Sorry, <b>Web Serial</b> is not supported on this browser.</p>
        <p>If you are on computer, please use Chrome or Opera</p>
        <p >If you are using Chrome, please make sure you're running Chrome 78 or later <br /> and have enabled the
          <code>#enable-experimental-web-platform-features</code> flag in
          <code>chrome://flags</code>.</p>
        <p> Mobile browsers are also not supported, check <a className="underline text-blue-400" href="https://caniuse.com/web-serial">Can I Use WebSerial</a> for compatibility.</p>
        <br />
        <p> Check out the <a className="underline text-blue-400" href="https://github.com/andreasNordstrand/arduino-web-flasher"> GitHub repo</a> for more information.</p>

      </div>}
      {uploadStatus && <div className="w-screen h-screen bg-opacity-90 fixed bg-gray-900 z-20 flex flex-col justify-center items-center">
        {uploadStatus === 'flashing' && <span className="loader"></span>}
        {uploadStatus === 'done' && <span><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-14 h-14 text-green-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        </span>}
        <h2 className="text-white text-2xl mt-6">{uploadStatusTitle}</h2>
        <p className="text-white mt-2 w-1/2 text-center">{uploadStatusMsg}</p>
        {uploadStatusMsg && <div className="flex flex-wrap justify-center gap-3 mt-6">
          {uploadStatus === 'done' && <button className="bg-cyan-500 py-1.5 px-4 hover:bg-cyan-600 rounded-md text-white" onClick={openSerialMonitor}>Open Serial Monitor</button>}
          <button className="bg-gray-600 py-1.5 px-4 hover:bg-gray-500 rounded-md text-white" onClick={clearStatus}>Close</button>
        </div>}
      </div>}
      <main className="flex-1 w-full max-w-6xl mx-auto px-5 py-12 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
      <form id="uploadForm" onSubmit={handleSubmit} className="flex flex-col w-full max-w-md mx-auto justify-center items-center">
        <h1 className="text-center text-white text-4xl ">Arduino Web Flasher</h1>
        <div className="flex justify-center items-center w-full">
          <div className="flex flex-row justify-center items-center w-full mt-16">
            <label
              htmlFor="dropzone-file"
              className={fileName ? 'hidden' : "relative p-4 bg-gray-50 rounded-lg border-2 border-gray-300 border-dashed cursor-pointer dark:hover:bg-bray-800 dark:bg-gray-700 hover:bg-gray-100 dark:border-gray-600 dark:hover:border-gray-500 dark:hover:bg-gray-600"}
              onDragOver={event => event.preventDefault()}
              onDrop={handleFileDrop}
            >
              <div className=" flex flex-col justify-center items-center pt-5 pb-6">
                <svg aria-hidden="true" className="mb-3 w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                <p className="mb-2 text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold">Click to upload</span> or drag and drop</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Only .hex or .bin files</p>
              </div>
              <input id="dropzone-file"
                ref={fileInput}
                type="file"
                className="hidden"
                onChange={event => selectFile(event.target.files[0])}
                onClick={() => fileInput.current.click()}
              />
            </label>
            {fileName &&
              <div className="w-2/3 h-10 flex flex-row justify-between bg-gray-700 text-white m-2 rounded-md items-center">
                <div className="ml-3">{fileName}</div>
                <button type="button" onClick={clearFileInput} className="px-2 border-l border-gray-500 h-full hover:bg-gray-500 rounded-r-md">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            }
          </div>
        </div>
        <span className="text-gray-500 text-center w-1/2 text-xs mt-1">Wondering how to get hex/bin files from the sketch? <a className="underline" href="https://randomnerdtutorials.com/bin-binary-files-sketch-arduino-ide/">Click here</a></span>
        <div className="w-2/3">
          <div className="flex flex-row justify-between relative">
            <label htmlFor="board-select" className="block mb-2 mt-8 text-sm font-medium text-gray-900 dark:text-gray-400">Select an option</label>
            <button
              type="button"
              className="mt-6"
              onMouseEnter={() => setInfoBoardSelectHover(true)}
              onMouseLeave={() => setInfoBoardSelectHover(false)}
            >
              <i className="text-white">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-5 h-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
              </i>
            </button>
            {infoBoardSelectHover && <span htmlFor="board-select" className="text-center w-3/4 text-xs text-gray-200 p-2 bg-gray-800 absolute right-10 rounded-lg transition-all opacity-90">Boards with checkmark✅ have been verified by the community. Not guaranteed to work on all boards</span>}

          </div>


          <select
            id="boardType"
            className="bg-gray-50 border cursor-pointer border-gray-300 text-gray-900 text-sm rounded-lg hover:border-gray-400 focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
            value={board}
            onChange={event => updateBoard(event.target.value)}
          >
            {BoardOptions}
          </select>
        </div>
        <button disabled={!fileName} type="submit" className="mt-4 relative inline-flex items-center justify-center p-0.5 mb-2 mr-2 overflow-hidden text-sm font-medium text-gray-900 rounded-lg group bg-gradient-to-br from-cyan-500 to-blue-500 group-hover:from-cyan-500 group-hover:to-blue-500 hover:text-white dark:text-white focus:ring-4 focus:outline-none focus:ring-cyan-200 dark:focus:ring-cyan-800 disabled:bg-gradient-to-br disabled:from-gray-500 disabled:to-gray-600 disabled:text-gray-500">
          <span className="relative px-8 py-2.5 transition-all ease-in duration-75 bg-white dark:bg-gray-900 rounded-md group-hover:bg-opacity-0">
            Upload to Arduino
          </span>
        </button>
      </form>
      <section aria-labelledby="serial-monitor-title" className="w-full max-w-2xl mx-auto bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-gray-700">
          <div>
            <h2 id="serial-monitor-title" className="text-white text-lg font-semibold">Serial Monitor</h2>
            <p className={`text-xs ${monitorStatus === "connected" ? "text-green-400" : "text-gray-400"}`}>{monitorStatusLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="monitor-baud-rate" className="text-xs text-gray-300">Baud</label>
            <select
              id="monitor-baud-rate"
              value={monitorBaudRate}
              disabled={monitorStatus !== "disconnected"}
              onChange={event => setMonitorBaudRate(event.target.value)}
              className="bg-gray-700 border border-gray-600 text-white text-sm rounded-md px-2 py-1.5 disabled:opacity-50"
            >
              {monitorBaudRates.map(baudRate => <option value={baudRate} key={baudRate}>{baudRate}</option>)}
            </select>
            {monitorStatus === "connected" || monitorStatus === "disconnecting" ?
              <button type="button" disabled={monitorStatus === "disconnecting"} onClick={disconnectSerialMonitor} className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white text-sm rounded-md px-3 py-1.5">Disconnect</button> :
              <button type="button" disabled={monitorStatus === "connecting"} onClick={connectSerialMonitor} className="bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 text-white text-sm rounded-md px-3 py-1.5">Connect</button>
            }
            <button type="button" onClick={() => setMonitorOutput("")} className="bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-md px-3 py-1.5">Clear</button>
          </div>
        </div>
        {monitorError && <p role="alert" className="px-4 py-2 bg-red-950 text-red-300 text-sm border-b border-red-900">{monitorError}</p>}
        <pre
          ref={monitorOutputElement}
          aria-live="polite"
          aria-label="Serial output"
          className="h-80 overflow-auto p-4 bg-gray-950 text-green-300 text-sm font-mono whitespace-pre-wrap break-words"
        >{monitorOutput || "Connect to a serial port to view output from your program."}</pre>
        <p className="px-4 py-3 text-xs text-gray-400 border-t border-gray-700">Choose the same baud rate used by <code className="text-gray-300">Serial.begin()</code> in your sketch.</p>
      </section>
      </main>
      <footer className="text-gray-500 flex flex-col text-xs justify-center text-center pb-2">
        <span className="p-2">Built on <a className="underline text-blue-400" href="https://github.com/noopkat/avrgirl-arduino">avrgirl-arduino</a></span>
        <span>Any issues? Please report them <a className="underline text-blue-400" href="https://github.com/EnviroDIY/arduino-web-flasher">here</a></span>
      </footer>
    </div>
  );
}

export default App;

// cSpell:ignore filecontents checkmark
