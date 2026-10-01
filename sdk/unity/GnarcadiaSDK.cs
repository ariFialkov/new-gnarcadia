// Gnarcadia Unity SDK (WebGL). Attach to a persistent GameObject named "Gnarcadia".
// Mirrors @gnarcadia/sdk: Init -> OnInit(match, player); SubmitScore; GameOver; Exit; Track.
// Realtime formats from Unity: use a WebSocket client (e.g. NativeWebSocket) with the ticket from RequestRealtimeTicket()
// and the wire protocol in packages/protocol/src/realtime.ts. Reference implementation — JS games are the primary target.
using System;
using System.Runtime.InteropServices;
using UnityEngine;

public class GnarcadiaSDK : MonoBehaviour
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] private static extern void Gnarcadia_Init(string gameObjectName);
    [DllImport("__Internal")] private static extern void Gnarcadia_Post(string json);
#else
    private static void Gnarcadia_Init(string go) { Debug.Log("[Gnarcadia] editor stub init"); }
    private static void Gnarcadia_Post(string json) { Debug.Log("[Gnarcadia] -> host " + json); }
#endif

    [Serializable] public class Player { public string playerId; public string displayName; public int team; }
    [Serializable] public class Match { public string matchId; public string gameId; public string format; public string seed; public int entryCents; public string currency; public int rakeBps; public int maxPlayers; public bool practice; public int timeLimitSec; public double startedAt; }
    [Serializable] private class InitMsg { public Player player; public Match match; public string locale; public bool reducedMotion; }

    public static GnarcadiaSDK Instance { get; private set; }
    public Player CurrentPlayer { get; private set; }
    public Match CurrentMatch { get; private set; }
    public System.Random Random { get; private set; }   // seeded from match.seed — use for ALL randomness
    public event Action OnInit, OnPause, OnResume;
    public event Action<string> OnTerminate, OnRealtimeTicket;
    private bool scoreSubmitted;

    void Awake() { if (Instance != null) { Destroy(gameObject); return; } Instance = this; DontDestroyOnLoad(gameObject); Gnarcadia_Init(gameObject.name); }

    // Called from JS
    public void OnGnarcadiaInit(string json)
    {
        var m = JsonUtility.FromJson<InitMsg>(json);
        CurrentPlayer = m.player; CurrentMatch = m.match;
        Random = new System.Random(StableHash(m.match.seed));
        OnInit?.Invoke();
    }
    public void OnGnarcadiaPause(string _) => OnPause?.Invoke();
    public void OnGnarcadiaResume(string _) => OnResume?.Invoke();
    public void OnGnarcadiaTerminate(string reason) => OnTerminate?.Invoke(reason);
    public void OnGnarcadiaTicket(string ticket) => OnRealtimeTicket?.Invoke(ticket);

    // Game -> host
    public void Ready() => Gnarcadia_Post("{\"type\":\"ready\"}");
    public void Loading(float progress) => Gnarcadia_Post("{\"type\":\"loading\",\"progress\":" + Mathf.Clamp01(progress).ToString(System.Globalization.CultureInfo.InvariantCulture) + "}");
    public void SubmitScore(double score)
    {
        if (scoreSubmitted) return; scoreSubmitted = true;
        var duration = (long)(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() - CurrentMatch.startedAt);
        Gnarcadia_Post("{\"type\":\"submit_score\",\"score\":" + score.ToString(System.Globalization.CultureInfo.InvariantCulture) + ",\"durationMs\":" + duration + "}");
    }
    public void GameOver() => Gnarcadia_Post("{\"type\":\"game_over\"}");
    public void Exit() => Gnarcadia_Post("{\"type\":\"request_exit\"}");
    public void Track(string evt) => Gnarcadia_Post("{\"type\":\"analytics\",\"event\":\"" + evt.Replace("\"", "") + "\"}");
    public void RequestRealtimeTicket() => Gnarcadia_Post("{\"type\":\"request_realtime_ticket\"}");

    private static int StableHash(string s) { unchecked { int h = 23; foreach (var ch in s) h = h * 31 + ch; return h; } }
}
