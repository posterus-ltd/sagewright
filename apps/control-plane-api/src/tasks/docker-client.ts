import Docker from 'dockerode';
import { PassThrough, type Duplex, type Writable } from 'node:stream';

/** A single shared dockerode client (the host's docker socket). */
export const createDockerClient = (): Docker => new Docker();

export interface ExecOpts {
  cmd: string[];
  workingDir?: string;
  env?: string[];
  /** Birth size of the PTY. Set so full-screen TUIs paint correctly on first frame. */
  initialSize?: { cols: number; rows: number };
}

export interface TerminalSession {
  /** Raw bidirectional PTY stream (Tty:true → no stdout/stderr multiplexing). */
  stream: Duplex;
  resize: (size: { cols: number; rows: number }) => Promise<void>;
  close: () => void;
}

export interface ContainerTerminal {
  exec(containerId: string, opts: ExecOpts): Promise<TerminalSession>;
}

type DockerLike = Pick<Docker, 'getContainer'>;

/**
 * Opens an interactive `docker exec` PTY inside a container. With Tty:true the
 * hijacked stream is raw bytes in both directions — exactly what an xterm needs.
 */
export const createContainerTerminal = (docker: DockerLike): ContainerTerminal => ({
  exec: async (containerId, opts) => {
    const exec = await docker.getContainer(containerId).exec({
      Cmd: opts.cmd,
      WorkingDir: opts.workingDir,
      Env: opts.env,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });
    // ConsoleSize ([rows, cols], Docker API ≥1.42) sizes the PTY at creation — before
    // the command spawns — so a TUI's first paint is correct with no resize race.
    const consoleSize = opts.initialSize ? { ConsoleSize: [opts.initialSize.rows, opts.initialSize.cols] } : {};
    const stream = (await exec.start({ hijack: true, stdin: true, Tty: true, ...consoleSize })) as unknown as Duplex;
    return {
      stream,
      resize: async ({ cols, rows }) => {
        await exec.resize({ w: cols, h: rows });
      },
      close: () => stream.destroy(),
    };
  },
});

/** A control-plane-driven agent run: a PTY whose process we also wait on for an exit code. */
export interface AgentExecSession extends TerminalSession {
  /** Write keystrokes (interjections) into the agent's stdin. */
  write: (data: string) => void;
  /** Resolve the exec exit code once the process has finished. */
  inspect: () => Promise<{ exitCode: number | null; running: boolean }>;
}

export interface CaptureResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ContainerExec {
  /** Run a command in a PTY and drive it from the control plane (headless agent run). */
  startAgent(containerId: string, opts: ExecOpts): Promise<AgentExecSession>;
  /** Run a command to completion, capturing demuxed stdout/stderr + exit code (git/gh). */
  capture(containerId: string, opts: { cmd: string[]; workingDir?: string; env?: string[] }): Promise<CaptureResult>;
}

/**
 * Higher-level exec built on the docker socket: the control plane uses this to start the
 * worker's predefined agent script over a PTY and to run git/gh non-interactively.
 */
export const createContainerExec = (docker: Docker): ContainerExec => ({
  startAgent: async (containerId, opts) => {
    const exec = await docker.getContainer(containerId).exec({
      Cmd: opts.cmd,
      WorkingDir: opts.workingDir,
      Env: opts.env,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });
    const consoleSize = opts.initialSize ? { ConsoleSize: [opts.initialSize.rows, opts.initialSize.cols] } : {};
    const stream = (await exec.start({ hijack: true, stdin: true, Tty: true, ...consoleSize })) as unknown as Duplex;
    return {
      stream,
      write: (data: string) => stream.write(data),
      resize: async ({ cols, rows }) => {
        await exec.resize({ w: cols, h: rows });
      },
      inspect: async () => {
        const info = await exec.inspect();
        return { exitCode: info.ExitCode ?? null, running: info.Running ?? false };
      },
      close: () => stream.destroy(),
    };
  },
  capture: async (containerId, opts) => {
    const exec = await docker.getContainer(containerId).exec({
      Cmd: opts.cmd,
      WorkingDir: opts.workingDir,
      Env: opts.env,
      AttachStdin: false,
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });
    const stream = (await exec.start({ hijack: true, stdin: false })) as unknown as Duplex;
    // With Tty:false docker multiplexes stdout/stderr on one stream; demux them apart.
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const collect = (sink: Buffer[]): Writable => {
      const pt = new PassThrough();
      pt.on('data', (b: Buffer) => sink.push(b));
      return pt;
    };
    docker.modem.demuxStream(stream, collect(out), collect(err));
    await new Promise<void>((resolve) => {
      stream.on('end', resolve);
      stream.on('close', resolve);
    });
    const info = await exec.inspect();
    return {
      exitCode: info.ExitCode ?? 0,
      stdout: Buffer.concat(out).toString('utf8'),
      stderr: Buffer.concat(err).toString('utf8'),
    };
  },
});
