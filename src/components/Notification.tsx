export default function Notification(props: {

}) {
    return (
        <div className="fixed z-[1000] bg-transparent">
            <div className="flex flex-col items-center p-[10px_20px] text-black bg-[00000090] rounded">
                <span>Số lượng giám định được cập nhật thành 3</span>
                <span>Hoàn tác</span>
            </div>
        </div>
    )
}