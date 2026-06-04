import { Button } from "@superset/ui/button";
import { Input } from "@superset/ui/input";
import { useState } from "react";
import { LuSend } from "react-icons/lu";
import { electronTrpc } from "lib/trpc-react";

interface Comment {
	id: string;
	taskId: string;
	author: string;
	text: string;
	createdAt: number;
}

interface CommentSectionProps {
	taskId: string;
	comments: Comment[];
}

export function CommentSection({ taskId, comments }: CommentSectionProps) {
	const [text, setText] = useState("");
	const utils = electronTrpc.useUtils();

	const createComment = electronTrpc.tasks.comments.create.useMutation({
		onSuccess: () => {
			utils.tasks.get.invalidate({ id: taskId });
			setText("");
		},
	});

	const handleSubmit = () => {
		if (!text.trim()) return;
		createComment.mutate({
			taskId,
			author: "user",
			text: text.trim(),
		});
	};

	return (
		<div className="space-y-2">
			<span className="text-xs font-medium text-foreground/60">Comments</span>

			{comments.length > 0 && (
				<div className="space-y-2 max-h-40 overflow-y-auto">
					{comments.map((comment) => (
						<div
							key={comment.id}
							className="rounded-md bg-background/50 px-3 py-2"
						>
							<p className="text-xs text-foreground/80">{comment.text}</p>
							<span className="text-[10px] text-foreground/40 mt-1 block">
								{new Date(comment.createdAt).toLocaleString()}
							</span>
						</div>
					))}
				</div>
			)}

			<div className="flex items-center gap-1.5">
				<Input
					value={text}
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") handleSubmit();
					}}
					placeholder="Add a comment..."
					className="h-7 text-xs flex-1"
				/>
				<Button
					variant="ghost"
					size="icon"
					className="size-7 shrink-0"
					disabled={!text.trim()}
					onClick={handleSubmit}
				>
					<LuSend className="size-3" />
				</Button>
			</div>
		</div>
	);
}
