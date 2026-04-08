using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SQLGuardObservatory.API.Controllers;

[ApiController]
[Route("api/system")]
[Authorize]
public class SystemInfoController : ControllerBase
{
    [HttpGet("uptime")]
    public ActionResult GetUptime()
    {
        var uptimeMs = Environment.TickCount64;
        var uptime = TimeSpan.FromMilliseconds(uptimeMs);

        return Ok(new
        {
            uptimeDays = (int)uptime.TotalDays,
            uptimeHours = uptime.Hours,
            serverName = Environment.MachineName
        });
    }
}
