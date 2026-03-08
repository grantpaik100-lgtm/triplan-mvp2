"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatMessage,
  ExtractedSlots,
  FinalizeChatResponse,
  FollowupSeed,
  StartChatResponse,
  TurnChatResponse,
} from "@/types/followupChat";

export default function FollowupMiniApp() {
  const [seed, setSeed] = useState<FollowupSeed | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [extractedSlots, setExtractedSlots] = useState<ExtractedSlots>({});
  const [missingSlots, setMissingSlots] = useState<string[]>([]);
  const [turnCount, setTurnCount] = useState(0);

  const [loadingSeed, setLoadingSeed] = useState(true);
  const [startingChat, setStartingChat] = useState(false);
  const [sending, setSending] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  const [finalizeSource, setFinalizeSource] = useState<
    "openai" | "rule_based_fallback" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("triplan_followup_seed");

      if (!raw) {
        setError("이전 단계 데이터가 없습니다. 설문을 다시 시작해주세요.");
        setLoadingSeed(false);
        return;
      }

      const parsed = JSON.parse(raw) as FollowupSeed;
      setSeed(parsed);
      setLoadingSeed(false);
    } catch (e) {
      console.error("seed parse error", e);
      setError("데이터를 불러오는 중 문제가 발생했습니다.");
      setLoadingSeed(false);
    }
  }, []);
  useEffect(() => {
  const el = textareaRef.current;
  if (!el) return;

  el.style.height = "0px";
  el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
}, [input]);
  useEffect(() => {
    if (!seed) return;

    const currentSeed = seed;

    async function startChat() {
      try {
        setStartingChat(true);
        setError(null);

        const res = await fetch("/api/followup-chat/start", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            seed: currentSeed,
          }),
        });

        if (!res.ok) {
          throw new Error("start chat failed");
        }

        const data = (await res.json()) as StartChatResponse;

        setMessages([
          {
            role: "assistant",
            content: data.assistantMessage,
          },
        ]);
        setExtractedSlots(data.extractedSlots ?? {});
        setMissingSlots(Array.isArray(data.missingSlots) ? data.missingSlots : []);
        setTurnCount(typeof data.turnCount === "number" ? data.turnCount : 0);
      } catch (e) {
        console.error("start chat error", e);
        setError("대화를 시작하는 중 문제가 발생했습니다.");
      } finally {
        setStartingChat(false);
      }
    }

    startChat();
  }, [seed]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, finalizing]);

  const canSend = useMemo(() => {
    return input.trim().length > 0 && !sending && !finalizing && !startingChat;
  }, [input, sending, finalizing, startingChat]);

  function handleRestart() {
    window.location.href = "/";
  }

  async function finalizeChat(params: {
    seed: FollowupSeed;
    nextMessages: ChatMessage[];
    nextSlots: ExtractedSlots;
  }) {
    const { seed: currentSeed, nextMessages, nextSlots } = params;

    try {
      setFinalizing(true);
      setError(null);

      const res = await fetch("/api/followup-chat/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seed: currentSeed,
          messages: nextMessages,
          extractedSlots: nextSlots,
        }),
      });

      if (!res.ok) {
        throw new Error("finalize failed");
      }

      const data = (await res.json()) as FinalizeChatResponse;

      if (!data?.planningInput) {
        throw new Error("invalid finalize response");
      }

      setFinalizeSource(data.source ?? null);

      sessionStorage.setItem(
        "triplan_followup_messages",
        JSON.stringify(nextMessages)
      );
      sessionStorage.setItem(
        "triplan_followup_slots",
        JSON.stringify(nextSlots)
      );
      sessionStorage.setItem(
        "triplan_planning_input",
        JSON.stringify(data.planningInput)
      );

      window.location.href = "/trip/generate";
    } catch (e) {
      console.error("finalize chat error", e);
      setError("대화 내용을 일정 설계용 데이터로 정리하는 중 문제가 발생했습니다.");
      setFinalizing(false);
    }
  }

  async function handleSend() {
    if (!seed || !canSend) return;

    const currentSeed = seed;
    const userMessage = input.trim();
    const nextMessagesAfterUser: ChatMessage[] = [
      ...messages,
      { role: "user", content: userMessage },
    ];

    setInput("");
    setMessages(nextMessagesAfterUser);
    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/followup-chat/turn", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seed: currentSeed,
          messages: nextMessagesAfterUser,
          extractedSlots,
          userMessage,
          turnCount,
        }),
      });

      if (!res.ok) {
        throw new Error("turn request failed");
      }

      const data = (await res.json()) as TurnChatResponse;

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: data.assistantMessage,
      };

      const nextMessages = [...nextMessagesAfterUser, assistantMessage];
      const nextSlots = data.extractedSlots ?? extractedSlots;

      setMessages(nextMessages);
      setExtractedSlots(nextSlots);
      setMissingSlots(Array.isArray(data.missingSlots) ? data.missingSlots : []);
      setTurnCount(typeof data.turnCount === "number" ? data.turnCount : turnCount + 1);

      if (data.shouldFinalize) {
        await finalizeChat({
          seed: currentSeed,
          nextMessages,
          nextSlots,
        });
        return;
      }
    } catch (e) {
      console.error("send message error", e);
      setError("메시지를 처리하는 중 문제가 발생했습니다.");
    } finally {
      setSending(false);
    }
  }

  function renderBubble(message: ChatMessage, index: number) {
    const isAssistant = message.role === "assistant";

    return (
      <div
        key={`${message.role}-${index}`}
        style={{
          display: "flex",
          justifyContent: isAssistant ? "flex-start" : "flex-end",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            maxWidth: "82%",
            padding: "14px 16px",
            borderRadius: 18,
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            background: isAssistant ? "rgba(255,255,255,0.88)" : "#111111",
            color: isAssistant ? "#111111" : "#ffffff",
            border: isAssistant ? "1px solid rgba(0,0,0,0.08)" : "none",
            boxShadow: isAssistant
              ? "0 10px 30px rgba(20,35,60,0.08)"
              : "0 10px 24px rgba(17,17,17,0.18)",
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  if (loadingSeed) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 20,
        }}
      >
        <div className="tp2-card" style={{ width: "100%", maxWidth: 760 }}>
          <div className="tp2-cardHeader">
            <h1 style={{ margin: 0, fontSize: 22 }}>데이터 불러오는 중</h1>
            <p style={{ marginTop: 10, opacity: 0.72 }}>
              이전 설문 정보를 확인하고 있습니다.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error && !seed) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 20,
        }}
      >
        <div className="tp2-card" style={{ width: "100%", maxWidth: 760 }}>
          <div className="tp2-cardHeader">
            <h1 style={{ margin: 0, fontSize: 22 }}>진행 정보를 찾을 수 없음</h1>
            <p style={{ marginTop: 10, opacity: 0.72 }}>{error}</p>
          </div>

          <div className="tp2-footer" style={{ marginTop: 20 }}>
            <button
              type="button"
              className="tp2-btnPrimary"
              onClick={handleRestart}
            >
              처음으로 이동
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "24px 16px 32px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 760,
          margin: "0 auto",
        }}
      >
        <section className="tp2-card" style={{ marginBottom: 16 }}>
          <div className="tp2-cardHeader">
            <div
              style={{
                fontSize: 12,
                opacity: 0.7,
                marginBottom: 6,
              }}
            >
              Follow-up Chat
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 24,
                lineHeight: 1.35,
              }}
            >
              일정 설계를 위해 몇 가지만 더 확인할게요
            </h1>

            <p
              style={{
                marginTop: 12,
                opacity: 0.76,
                lineHeight: 1.6,
              }}
            >
              대화처럼 편하게 답하면 됩니다. 궁금한 점이 있으면 중간에 바로
              물어봐도 됩니다.
            </p>

            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                opacity: 0.62,
              }}
            >
              현재 턴: {turnCount} / 누락 슬롯: {missingSlots.length}
              {finalizeSource ? ` / 최종 변환: ${finalizeSource}` : ""}
            </div>
          </div>
        </section>
        <section
  className="tp2-card"
  style={{
    marginBottom: 16,
    height: "calc(100vh - 260px)",
    minHeight: 520,
    maxHeight: 820,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  }}
>
  <div
    style={{
      padding: 16,
      flex: 1,
      overflowY: "auto",
      overscrollBehavior: "contain",
      background: "rgba(255,255,255,0.42)",
    }}
  >
    {startingChat && (
      <div style={{ opacity: 0.72, lineHeight: 1.6 }}>
        대화를 시작하는 중입니다...
      </div>
    )}

    {!startingChat && messages.map(renderBubble)}

    {(sending || finalizing) && (
      <div
        style={{
          display: "flex",
          justifyContent: "flex-start",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            maxWidth: "82%",
            padding: "14px 16px",
            borderRadius: 18,
            lineHeight: 1.6,
            background: "rgba(255,255,255,0.88)",
            color: "#111111",
            border: "1px solid rgba(0,0,0,0.08)",
            boxShadow: "0 10px 30px rgba(20,35,60,0.08)",
          }}
        >
          {finalizing
            ? "대화 내용을 일정 설계 기준으로 정리하고 있어요..."
            : "생각 중..."}
        </div>
      </div>
    )}

    <div ref={messagesEndRef} />
  </div>

  <div
    style={{
      borderTop: "1px solid rgba(0,0,0,0.08)",
      padding: 14,
      background: "rgba(255,255,255,0.82)",
      backdropFilter: "blur(10px)",
      position: "sticky",
      bottom: 0,
    }}
  >
    <label
      htmlFor="followup-chat-input"
      style={{
        display: "block",
        fontSize: 12,
        opacity: 0.7,
        marginBottom: 8,
      }}
    >
      답변 입력
    </label>

    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-end",
        padding: 10,
        borderRadius: 22,
        border: "1px solid rgba(0,0,0,0.10)",
        background: "#ffffff",
        boxShadow: "0 8px 24px rgba(20,35,60,0.06)",
      }}
    >
      <textarea
        ref={textareaRef}
        id="followup-chat-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (canSend) {
              void handleSend();
            }
          }
        }}
        placeholder="편하게 입력하세요. 궁금한 점이 있으면 같이 물어봐도 됩니다."
        rows={1}
        style={{
          width: "100%",
          minHeight: 28,
          maxHeight: 140,
          resize: "none",
          border: "none",
          padding: "8px 10px",
          font: "inherit",
          lineHeight: 1.6,
          outline: "none",
          background: "transparent",
        }}
        disabled={sending || finalizing || startingChat}
      />

      <button
        type="button"
        className="tp2-btnPrimary"
        onClick={() => void handleSend()}
        disabled={!canSend}
        style={{
          minWidth: 92,
          flexShrink: 0,
          opacity: canSend ? 1 : 0.6,
          cursor: canSend ? "pointer" : "not-allowed",
          borderRadius: 16,
        }}
      >
        보내기
      </button>
    </div>
  </div>
</section>

        
      </div>
    </main>
  );
}
