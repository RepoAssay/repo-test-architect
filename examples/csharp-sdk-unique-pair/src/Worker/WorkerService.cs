namespace Worker;

public sealed class WorkerService
{
    public int Run(int value) => value < 0 ? 0 : value;
}
